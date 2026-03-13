import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DeliveryStatus, ProviderOrderStatus, Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import * as argon2 from 'argon2';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  private readonly stripe: Stripe;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
  ) {
    const stripeSecretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      throw new Error(
        'STRIPE_SECRET_KEY is missing or empty in the environment configuration.',
      );
    }

    this.stripe = new Stripe(stripeSecretKey, {
      // TODO: Update when Stripe publishes a stable GA SDK — stripe@20.x only
      // supports '2026-02-25.clover'; changing this causes a TS compilation error.
      apiVersion: '2026-02-25.clover',
    });
  }

  async isProcessed(eventId: string): Promise<boolean> {
    const event = await this.prisma.webhookEvent.findUnique({
      where: { id: eventId },
    });
    return !!event;
  }
  /**
   * Generates a Stripe Onboarding Link for Providers/Runners.
   * If the user doesn't have a stripeAccountId, it creates an Express account first.
   */
  async generateOnboardingLink(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    let accountId = user.stripeAccountId;

    // 1. Create a Stripe Express Account if none exists
    if (!accountId) {
      const account = await this.stripe.accounts.create({
        type: 'express',
        email: user.email,
        capabilities: {
          transfers: { requested: true },
        },
        business_type: 'individual',
      });
      accountId = account.id;

      // Save the dormant accountId to DB
      await this.prisma.user.update({
        where: { id: userId },
        data: { stripeAccountId: accountId },
      });
    }

    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3001';

    // 2. Generate the Onboarding Link
    const accountLink = await this.stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${frontendUrl}/dashboard?stripe_connected=refresh`,
      return_url: `${this.configService.get<string>('BACKEND_URL') || 'http://localhost:3000'}/payments/connect/callback?accountId=${accountId}`,
      type: 'account_onboarding',
    });

    return accountLink.url;
  }

  /**
   * Verifies if the Stripe Account is fully setup and active after OAuth callback.
   */
  async verifyAndSaveConnectedAccount(
    userId: string,
    accountId: string,
  ): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user?.stripeAccountId !== accountId) {
      throw new ConflictException('Account ID mismatch or user not found');
    }

    const account = await this.stripe.accounts.retrieve(accountId);

    if (!account.details_submitted) {
      throw new ConflictException(
        'Stripe Onboarding is incomplete. Please finish the registration.',
      );
    }

    return true; // DB already has the ID, we just confirmed its active status
  }

  /**
   * Creates a Stripe Payment Intent using Direct Charges (Zero-Liability).
   * The charge is created directly on the Provider's Stripe Account.
   * Mecerka routes the runner's cut through the application_fee_amount, then transfers it out.
   */
  async createTripartitePaymentIntent(orderId: string, clientId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId, clientId },
      include: { providerOrders: { include: { provider: true, items: true } } },
    });

    if (!order || order.status !== DeliveryStatus.PENDING) {
      throw new NotFoundException('Order not found or not in PENDING state');
    }

    if (order.providerOrders.length !== 1) {
      throw new ConflictException(
        'El flujo de pago actual solo admite pedidos de un único proveedor.',
      );
    }

    const po = order.providerOrders[0];
    if (!po) throw new ConflictException('Order has no provider items');

    const providerStripeId = po.provider.stripeAccountId;
    if (!providerStripeId) {
      throw new ConflictException(
        'El proveedor de este pedido aún no ha verificado su cuenta bancaria. No puede recibir pagos.',
      );
    }

    // 1. Calculate Base Amounts
    const productsTotalCents = po.items.reduce(
      (acc, item) =>
        acc + Math.round(Number(item.priceAtPurchase) * 100) * item.quantity,
      0,
    );

    // 2. Logistics Business Rule: 50/50 Split (e.g. 6.00 EUR delivery = 3.00 Client, 3.00 Provider)
    const totalLogisticsCents = 600; // Fixed for MVP. Total runner cost.
    const clientLogisticsBurdenCents = totalLogisticsCents / 2; // 300 cents
    const providerLogisticsBurdenCents = totalLogisticsCents / 2; // 300 cents

    // 3. Final Amounts
    // What the client actually pays on the Checkout screen (Products + their half of delivery)
    const finalChargeToClientCents =
      productsTotalCents + clientLogisticsBurdenCents;

    // The "Application Fee" is the conduit to extract the Runner's money from the charge
    // It's the Client's half + The Provider's half.
    const applicationFeeCents =
      clientLogisticsBurdenCents + providerLogisticsBurdenCents; // 600 cents

    // 4. Create Direct Charge Intent onto Provider Account
    const session = await this.stripe.paymentIntents.create(
      {
        amount: finalChargeToClientCents,
        currency: 'eur',
        application_fee_amount: applicationFeeCents,
        transfer_group: `ORDER_${order.id}`,
        metadata: {
          orderId: order.id,
          logisticsTotal: totalLogisticsCents,
        },
        automatic_payment_methods: { enabled: true },
      },
      {
        stripeAccount: providerStripeId, // Directly onto the Provider's Connected Account
      },
    );

    // 5. Save the Payment Intent ID (so webhooks can find order)
    await this.prisma.order.update({
      where: { id: order.id },
      data: { paymentRef: session.id },
    });

    return {
      clientSecret: session.client_secret,
      stripeAccountId: providerStripeId, // Frontend needs this to mount the Elements widget
      breakdown: {
        totalCharge: finalChargeToClientCents / 100,
        products: productsTotalCents / 100,
        logisticsFeeClient: clientLogisticsBurdenCents / 100,
        logisticsFeeProvider: providerLogisticsBurdenCents / 100,
        providerNetRevenue:
          (productsTotalCents - providerLogisticsBurdenCents) / 100,
      },
    };
  }

  /**
   * Processes a "Cash on Delivery" or "Al Contado" payment.
   * Skips Stripe entirely but marks the order securely and returns the 50/50 ledger breakdown.
   */
  async processCashPayment(orderId: string, clientId: string, pin: string) {
    if (!pin) {
      throw new BadRequestException(
        'El PIN es requerido para pagos en efectivo',
      );
    }

    const user = await this.prisma.user.findUnique({ where: { id: clientId } });
    if (!user?.pin)
      throw new BadRequestException('Debes configurar un PIN transaccional.');

    const isPinValid = await argon2.verify(user.pin, pin);
    if (!isPinValid)
      throw new UnauthorizedException('PIN de compra incorrecto.');

    const order = await this.prisma.order.findUnique({
      where: { id: orderId, clientId },
      include: { providerOrders: { include: { items: true } } },
    });

    if (!order || order.status !== DeliveryStatus.PENDING) {
      throw new NotFoundException('Order not found or not in PENDING state');
    }

    if (order.providerOrders.length !== 1) {
      throw new ConflictException(
        'El flujo de pago actual solo admite pedidos de un único proveedor.',
      );
    }

    const po = order.providerOrders[0];
    if (!po) throw new ConflictException('Order has no provider items');

    // Calculate logistics split for ledger
    const productsTotalCents = po.items.reduce(
      (acc, item) =>
        acc + Math.round(Number(item.priceAtPurchase) * 100) * item.quantity,
      0,
    );
    const totalLogisticsCents = 600;
    const clientLogisticsBurdenCents = totalLogisticsCents / 2;
    const providerLogisticsBurdenCents = totalLogisticsCents / 2;

    const finalChargeToClientCents =
      productsTotalCents + clientLogisticsBurdenCents;

    // Update the order locally as confirmed logically (simulate webhook success)
    const paymentRef = `CASH_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    await this.prisma.$transaction(async (tx) => {
      const providerHasStock = await this.attemptStockDeduction(tx, po.items);
      if (!providerHasStock)
        throw new ConflictException(
          'Out of stock items during cash order processing',
        );

      await tx.order.update({
        where: { id: order.id },
        data: {
          status: DeliveryStatus.CONFIRMED,
          paymentRef,
          confirmedAt: new Date(),
        },
      });
    });

    this.eventEmitter.emit('order.stateChanged', {
      orderId: order.id,
      status: DeliveryStatus.CONFIRMED,
      paymentRef,
    });

    return {
      method: 'CASH',
      success: true,
      breakdown: {
        totalCharge: finalChargeToClientCents / 100,
        logisticsDebtClient: clientLogisticsBurdenCents / 100,
        logisticsDebtProvider: providerLogisticsBurdenCents / 100,
      },
    };
  }

  private async attemptStockDeduction(
    tx: Prisma.TransactionClient,
    items: any[],
  ): Promise<boolean> {
    const productIds = items.map((i) => i.productId);
    const products = await tx.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, stock: true },
    });
    const productMap = new Map(products.map((p: any) => [p.id, p]));

    for (const item of items) {
      const p: any = productMap.get(item.productId);
      if (!p || p.stock < item.quantity) {
        return false;
      }
    }

    for (const item of items) {
      await tx.product.updateMany({
        where: {
          id: item.productId,
          stock: { gte: item.quantity },
        },
        data: {
          stock: { decrement: item.quantity },
        },
      });
    }
    return true;
  }

  /**
   * Completes the payment process idempotently using a webhook event ID.
   * Handles partial fulfillment if stock runs out concurrently.
   */
  async confirmPayment(orderId: string, paymentRef: string, eventId: string) {
    // 1. Early idempotency check
    if (await this.isProcessed(eventId)) {
      return { message: 'Webhook already processed' };
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // 2. Atomic Event Registration
      try {
        await tx.webhookEvent.create({
          data: { id: eventId },
        });
      } catch (e: any) {
        if (e.code === 'P2002')
          return { message: 'Webhook already processed concurrently' };
        throw e;
      }

      // 3. Fetch Order with pending state
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          providerOrders: {
            include: { items: true },
          },
        },
      });

      if (!order) {
        throw new NotFoundException('Order not found');
      }

      if (order.status !== DeliveryStatus.PENDING) {
        return { message: 'Order is no longer PENDING', status: order.status };
      }

      const confirmedProviderOrders: string[] = [];
      const rejectedProviderOrders: string[] = [];

      // 4. Optimistic Stock Deduction & Partial Fulfillment Logic
      for (const po of order.providerOrders) {
        const providerHasStock = await this.attemptStockDeduction(tx, po.items);

        if (providerHasStock) {
          confirmedProviderOrders.push(po.id);
          // ProviderOrder remains PENDING until the store manually accepts it
        } else {
          rejectedProviderOrders.push(po.id);
          await tx.providerOrder.update({
            where: { id: po.id },
            data: { status: ProviderOrderStatus.REJECTED_BY_STORE },
          });
        }
      }

      // 5. Update Order to final state using optimistic concurrency
      const allRejected = confirmedProviderOrders.length === 0;
      const finalStatus = allRejected
        ? DeliveryStatus.CANCELLED
        : DeliveryStatus.CONFIRMED;

      const updatedOrder = await tx.order.updateMany({
        where: { id: orderId, status: DeliveryStatus.PENDING },
        data: {
          status: finalStatus,
          paymentRef,
          confirmedAt: new Date(),
        },
      });

      if (updatedOrder.count === 0) {
        throw new ConflictException(
          'Order status changed concurrently during payment confirmation',
        );
      }

      // 6. Return events to decouple downstream logic from transaction
      return {
        success: true,
        orderId: order.id,
        status: finalStatus,
        paymentRef,
        _events: {
          stateChanged: {
            orderId: order.id,
            status: finalStatus,
            paymentRef,
          },
          partialCancelled:
            !allRejected && rejectedProviderOrders.length > 0
              ? {
                  orderId: order.id,
                  rejectedProviderOrderIds: rejectedProviderOrders,
                }
              : null,
        },
      };
    });

    if (result?._events) {
      this.eventEmitter.emit('order.stateChanged', result._events.stateChanged);
      if (result._events.partialCancelled) {
        this.eventEmitter.emit(
          'order.partialCancelled',
          result._events.partialCancelled,
        );
      }
      delete (result as any)._events;
    }

    return result;
  }
}
