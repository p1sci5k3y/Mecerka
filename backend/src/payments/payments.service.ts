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
import {
  DeliveryStatus,
  PaymentAccountOwnerType,
  PaymentAccountProvider,
  PaymentSessionStatus,
  ProviderOrderStatus,
  ProviderPaymentStatus,
  Prisma,
  Role,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import * as argon2 from 'argon2';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private static readonly WEBHOOK_STATUS_RECEIVED = 'RECEIVED';
  private static readonly WEBHOOK_STATUS_PROCESSED = 'PROCESSED';
  private static readonly WEBHOOK_STATUS_IGNORED = 'IGNORED';
  private static readonly WEBHOOK_STATUS_FAILED = 'FAILED';

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
    const event = await (this.prisma as any).paymentWebhookEvent.findUnique({
      where: { id: eventId },
    });
    return !!event;
  }

  private async claimWebhookEvent(eventId: string, provider: string, eventType: string) {
    try {
      await (this.prisma as any).paymentWebhookEvent.create({
        data: {
          id: eventId,
          provider,
          eventType,
          status: PaymentsService.WEBHOOK_STATUS_RECEIVED,
        },
      });
      return true;
    } catch (error: any) {
      if (error?.code === 'P2002') {
        return false;
      }
      throw error;
    }
  }

  private async markWebhookEventStatus(
    eventId: string,
    status: string,
    processedAt?: Date,
  ) {
    await (this.prisma as any).paymentWebhookEvent.update({
      where: { id: eventId },
      data: {
        status,
        ...(processedAt ? { processedAt } : {}),
      },
    });
  }

  async upsertPaymentAccount(
    ownerType: PaymentAccountOwnerType,
    ownerId: string,
    provider: PaymentAccountProvider,
    externalAccountId: string,
  ) {
    return this.prisma.paymentAccount.upsert({
      where: {
        ownerType_ownerId_provider: {
          ownerType,
          ownerId,
          provider,
        },
      },
      update: {
        externalAccountId,
        isActive: true,
      },
      create: {
        ownerType,
        ownerId,
        provider,
        externalAccountId,
        isActive: true,
      },
    });
  }

  async getActivePaymentAccount(
    ownerType: PaymentAccountOwnerType,
    ownerId: string,
    provider: PaymentAccountProvider,
  ) {
    return this.prisma.paymentAccount.findFirst({
      where: {
        ownerType,
        ownerId,
        provider,
        isActive: true,
      },
    });
  }

  private async resolveActiveStripePaymentAccount(
    ownerType: PaymentAccountOwnerType,
    ownerId: string,
  ) {
    const existing = await this.getActivePaymentAccount(
      ownerType,
      ownerId,
      PaymentAccountProvider.STRIPE,
    );

    if (existing) {
      return existing;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: {
        stripeAccountId: true,
      },
    });

    if (!user?.stripeAccountId) {
      return null;
    }

    return this.upsertPaymentAccount(
      ownerType,
      ownerId,
      PaymentAccountProvider.STRIPE,
      user.stripeAccountId,
    );
  }

  private resolvePaymentAccountOwnerType(roles: Role[]) {
    if (roles.includes(Role.PROVIDER)) {
      return PaymentAccountOwnerType.PROVIDER;
    }

    if (roles.includes(Role.RUNNER)) {
      return PaymentAccountOwnerType.RUNNER;
    }

    return null;
  }

  async prepareProviderOrderPayment(providerOrderId: string, clientId: string) {
    const now = new Date();
    const eligibleStatuses: ProviderOrderStatus[] = [
      ProviderOrderStatus.PENDING,
      ProviderOrderStatus.PAYMENT_PENDING,
      ProviderOrderStatus.PAYMENT_READY,
    ];

    return this.prisma.$transaction(async (tx: any) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT 1 FROM "ProviderOrder" WHERE "id" = ${providerOrderId}::uuid FOR UPDATE`,
      );

      const providerOrder = await tx.providerOrder.findUnique({
        where: { id: providerOrderId },
        include: {
          order: {
            select: {
              id: true,
              clientId: true,
            },
          },
          reservations: {
            where: {
              status: 'ACTIVE',
              expiresAt: { gt: now },
            },
            select: {
              expiresAt: true,
            },
          },
          paymentSessions: {
            where: {
              status: {
                in: [PaymentSessionStatus.CREATED, PaymentSessionStatus.READY],
              },
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      });
      const paymentSessions: any[] = providerOrder?.paymentSessions ?? [];

      if (!providerOrder || providerOrder.order.clientId !== clientId) {
        throw new NotFoundException('ProviderOrder not found');
      }

      if (!eligibleStatuses.includes(providerOrder.status)) {
        throw new ConflictException(
          'ProviderOrder is not eligible for payment preparation',
        );
      }

      if (providerOrder.paymentStatus === ProviderPaymentStatus.PAID) {
        throw new ConflictException('ProviderOrder is already paid');
      }

      const reservationExpiresAt =
        providerOrder.reservations.length > 0
          ? providerOrder.reservations.reduce(
              (earliest: Date, reservation: { expiresAt: Date }) =>
                reservation.expiresAt < earliest ? reservation.expiresAt : earliest,
              providerOrder.reservations[0].expiresAt,
            )
          : null;

      if (!reservationExpiresAt) {
        throw new ConflictException(
          'ProviderOrder has no active stock reservation for payment',
        );
      }

      const expiredSessionIds = paymentSessions
        .filter(
          (session) => session.expiresAt && session.expiresAt.getTime() <= now.getTime(),
        )
        .map((session) => session.id);

      if (expiredSessionIds.length > 0) {
        await tx.providerPaymentSession.updateMany({
          where: {
            id: { in: expiredSessionIds },
            status: { in: [PaymentSessionStatus.CREATED, PaymentSessionStatus.READY] },
          },
          data: {
            status: PaymentSessionStatus.EXPIRED,
          },
        });
      }

      const activeSession = paymentSessions.find(
        (session) =>
          session.status === PaymentSessionStatus.READY &&
          session.externalSessionId &&
          (!session.expiresAt || session.expiresAt.getTime() > now.getTime()),
      );

      const paymentAccount = await this.resolveActiveStripePaymentAccount(
        PaymentAccountOwnerType.PROVIDER,
        providerOrder.providerId,
      );

      if (!paymentAccount?.isActive) {
        throw new ConflictException(
          'Provider payment account is not active for this provider order',
        );
      }

      if (activeSession) {
        const existingIntent = await this.stripe.paymentIntents.retrieve(
          activeSession.externalSessionId,
          {
            stripeAccount: paymentAccount.externalAccountId,
          },
        );

        await tx.providerOrder.update({
          where: { id: providerOrderId },
          data: {
            paymentStatus: ProviderPaymentStatus.PAYMENT_READY,
            paymentReadyAt: providerOrder.paymentReadyAt ?? now,
            paymentExpiresAt: reservationExpiresAt,
            paymentRef: activeSession.externalSessionId,
            status:
              providerOrder.status === ProviderOrderStatus.PENDING
                ? ProviderOrderStatus.PAYMENT_READY
                : providerOrder.status,
          },
        });

        return {
          providerOrderId: providerOrder.id,
          paymentSessionId: activeSession.id,
          externalSessionId: activeSession.externalSessionId,
          clientSecret: existingIntent.client_secret,
          stripeAccountId: paymentAccount.externalAccountId,
          expiresAt: activeSession.expiresAt,
          paymentStatus: ProviderPaymentStatus.PAYMENT_READY,
        };
      }

      const intent = await this.stripe.paymentIntents.create(
        {
          amount: Math.round(Number(providerOrder.subtotalAmount) * 100),
          currency: 'eur',
          automatic_payment_methods: { enabled: true },
          metadata: {
            orderId: providerOrder.order.id,
            providerOrderId: providerOrder.id,
          },
        },
        {
          stripeAccount: paymentAccount.externalAccountId,
        },
      );

      const session = await tx.providerPaymentSession.create({
        data: {
          providerOrderId: providerOrder.id,
          paymentProvider: PaymentAccountProvider.STRIPE,
          externalSessionId: intent.id,
          paymentUrl: null,
          status: PaymentSessionStatus.READY,
          expiresAt: reservationExpiresAt,
          providerResponsePayload: {
            stripeAccountId: paymentAccount.externalAccountId,
            paymentIntentId: intent.id,
            livemode: Boolean((intent as any).livemode ?? false),
          },
        } as any,
      });

      await tx.providerOrder.update({
        where: { id: providerOrderId },
        data: {
          paymentStatus: ProviderPaymentStatus.PAYMENT_READY,
          paymentReadyAt: now,
          paymentExpiresAt: reservationExpiresAt,
          paymentRef: intent.id,
          status:
            providerOrder.status === ProviderOrderStatus.PENDING
              ? ProviderOrderStatus.PAYMENT_READY
              : providerOrder.status,
        },
      });

      return {
        providerOrderId: providerOrder.id,
        paymentSessionId: session.id,
        externalSessionId: intent.id,
        clientSecret: intent.client_secret,
        stripeAccountId: paymentAccount.externalAccountId,
        expiresAt: reservationExpiresAt,
        paymentStatus: ProviderPaymentStatus.PAYMENT_READY,
      };
    });
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

      const ownerType = this.resolvePaymentAccountOwnerType(user.roles);
      if (ownerType) {
        await this.upsertPaymentAccount(
          ownerType,
          userId,
          PaymentAccountProvider.STRIPE,
          accountId,
        );
      }
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

    const ownerType = this.resolvePaymentAccountOwnerType(user.roles);
    if (ownerType) {
      await this.upsertPaymentAccount(
        ownerType,
        userId,
        PaymentAccountProvider.STRIPE,
        accountId,
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
      include: { providerOrders: true },
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

    return this.prepareProviderOrderPayment(po.id, clientId);
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
  async confirmProviderOrderPayment(
    externalSessionId: string,
    eventId: string,
    eventType: string,
  ) {
    const claimed = await this.claimWebhookEvent(eventId, 'STRIPE', eventType);
    if (!claimed) {
      return { message: 'Webhook already processed' };
    }

    try {
      const result = await this.prisma.$transaction(async (tx: any) => {
        const now = new Date();

        const paymentSession = await tx.providerPaymentSession.findUnique({
          where: { externalSessionId },
          include: {
            providerOrder: {
              include: { items: true },
            },
          },
        });

        if (!paymentSession) {
          throw new NotFoundException('Payment session not found');
        }

        const providerOrder = await tx.providerOrder.findUnique({
          where: { id: paymentSession.providerOrderId },
          include: {
            order: {
              include: {
                providerOrders: {
                  select: {
                    id: true,
                    paymentStatus: true,
                  },
                },
              },
            },
            reservations: {
              where: { status: 'ACTIVE' },
              select: {
                id: true,
                productId: true,
                quantity: true,
                expiresAt: true,
              },
            },
            items: true,
          },
        });

        if (!providerOrder) {
          throw new NotFoundException('ProviderOrder not found');
        }

        if (paymentSession.status === PaymentSessionStatus.COMPLETED) {
          return {
            message: 'Provider payment session already completed',
            status: providerOrder.status,
          };
        }

        if (providerOrder.paymentStatus === ProviderPaymentStatus.PAID) {
          return { message: 'ProviderOrder already paid', status: providerOrder.status };
        }

        if (providerOrder.reservations.length === 0) {
          throw new ConflictException(
            'ProviderOrder has no active reservations to consume',
          );
        }

        const hasExpiredReservations = providerOrder.reservations.some(
          (reservation: { expiresAt?: Date | null }) =>
            reservation.expiresAt instanceof Date &&
            reservation.expiresAt.getTime() <= now.getTime(),
        );
        if (hasExpiredReservations) {
          this.logger.warn(
            `Stripe webhook ${eventId} confirmed expired reservation for providerOrder ${providerOrder.id} and session ${externalSessionId}`,
          );
        }

        const productIds = [
          ...new Set(
            providerOrder.reservations.map((reservation: any) => reservation.productId),
          ),
        ];

        await tx.$executeRaw(
          Prisma.sql`SELECT 1 FROM "Product" WHERE "id" IN (${Prisma.join(
            productIds.map((id) => Prisma.sql`${id}::uuid`),
          )}) FOR UPDATE`,
        );

        for (const reservation of providerOrder.reservations) {
          const updated = await tx.product.updateMany({
            where: {
              id: reservation.productId,
              stock: { gte: reservation.quantity },
            },
            data: {
              stock: { decrement: reservation.quantity },
            },
          });

          if (updated.count !== 1) {
            throw new ConflictException(
              'Concurrent stock update detected during payment confirmation',
            );
          }
        }

        await tx.stockReservation.updateMany({
          where: {
            providerOrderId: providerOrder.id,
            status: 'ACTIVE',
          },
          data: {
            status: 'CONSUMED',
          },
        });

        await tx.providerPaymentSession.update({
          where: { id: paymentSession.id },
          data: {
            status: PaymentSessionStatus.COMPLETED,
          },
        });

        const siblingProviderOrders = providerOrder.order.providerOrders.map((sibling: any) =>
          sibling.id === providerOrder.id
            ? { ...sibling, paymentStatus: ProviderPaymentStatus.PAID }
            : sibling,
        );
        const allProviderOrdersPaid = siblingProviderOrders.every(
          (sibling: any) => sibling.paymentStatus === ProviderPaymentStatus.PAID,
        );

        await tx.providerOrder.update({
          where: { id: providerOrder.id },
          data: {
            paymentStatus: ProviderPaymentStatus.PAID,
            status: ProviderOrderStatus.PAID,
            paidAt: now,
          },
        });

        let updatedOrderStatus = providerOrder.order.status;
        if (
          allProviderOrdersPaid &&
          providerOrder.order.status === DeliveryStatus.PENDING
        ) {
          updatedOrderStatus = DeliveryStatus.CONFIRMED;
          await tx.order.update({
            where: { id: providerOrder.order.id },
            data: {
              status: DeliveryStatus.CONFIRMED,
              confirmedAt: now,
            },
          });
        }

        return {
          success: true,
          orderId: providerOrder.order.id,
          providerOrderId: providerOrder.id,
          status: updatedOrderStatus,
          paymentStatus: ProviderPaymentStatus.PAID,
          paymentRef: externalSessionId,
          _events: {
            stateChanged: {
              orderId: providerOrder.order.id,
              status: updatedOrderStatus,
              paymentRef: externalSessionId,
            },
            partialCancelled: null,
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

      await this.markWebhookEventStatus(
        eventId,
        result?.message
          ? PaymentsService.WEBHOOK_STATUS_IGNORED
          : PaymentsService.WEBHOOK_STATUS_PROCESSED,
        new Date(),
      );

      return result;
    } catch (error) {
      await this.markWebhookEventStatus(
        eventId,
        PaymentsService.WEBHOOK_STATUS_FAILED,
        new Date(),
      );
      throw error;
    }
  }

  async confirmPayment(orderId: string, paymentRef: string, eventId: string) {
    void orderId;

    if (await this.isProcessed(eventId)) {
      return { message: 'Webhook already processed' };
    }

    return this.confirmProviderOrderPayment(
      paymentRef,
      eventId,
      'payment_intent.succeeded',
    );
  }
}
