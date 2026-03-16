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

type PaymentConfirmationPayload = {
  amount?: number | null;
  amountReceived?: number | null;
  currency?: string | null;
  accountId?: string | null;
  metadata?: Record<string, string | undefined> | null;
};

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private static readonly WEBHOOK_STATUS_RECEIVED = 'RECEIVED';
  private static readonly WEBHOOK_STATUS_PROCESSED = 'PROCESSED';
  private static readonly WEBHOOK_STATUS_IGNORED = 'IGNORED';
  private static readonly WEBHOOK_STATUS_FAILED = 'FAILED';
  private static readonly DEFAULT_PROVIDER_ORDER_CURRENCY = 'eur';
  private static readonly STALE_WEBHOOK_RECEIVED_MS = 5 * 60 * 1000;
  private static readonly FINAL_WEBHOOK_STATUSES = new Set<string>([
    PaymentsService.WEBHOOK_STATUS_PROCESSED,
    PaymentsService.WEBHOOK_STATUS_IGNORED,
  ]);

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
      select: { status: true },
    });
    return event
      ? PaymentsService.FINAL_WEBHOOK_STATUSES.has(event.status ?? '')
      : false;
  }

  private async claimWebhookEvent(
    eventId: string,
    provider: string,
    eventType: string,
  ) {
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
        const staleBefore = new Date(
          Date.now() - PaymentsService.STALE_WEBHOOK_RECEIVED_MS,
        );
        const reclaimed = await (
          this.prisma as any
        ).paymentWebhookEvent.updateMany({
          where: {
            id: eventId,
            OR: [
              { status: PaymentsService.WEBHOOK_STATUS_FAILED },
              {
                status: PaymentsService.WEBHOOK_STATUS_RECEIVED,
                receivedAt: { lt: staleBefore },
              },
            ],
          },
          data: {
            provider,
            eventType,
            status: PaymentsService.WEBHOOK_STATUS_RECEIVED,
            receivedAt: new Date(),
            processedAt: null,
          },
        });

        return reclaimed.count === 1 ? true : false;
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

  private normalizeCurrency(value?: string | null) {
    return value?.trim().toLowerCase() ?? null;
  }

  private buildProviderPaymentMetadata(
    orderId: string,
    providerOrderId: string,
    providerPaymentSessionId: string,
  ) {
    return {
      orderId,
      providerOrderId,
      providerPaymentSessionId,
    };
  }

  private async resolveActiveStripePaymentAccountWithinClient(
    client: any,
    ownerType: PaymentAccountOwnerType,
    ownerId: string,
  ) {
    const existing = await client.paymentAccount.findFirst({
      where: {
        ownerType,
        ownerId,
        provider: PaymentAccountProvider.STRIPE,
        isActive: true,
      },
    });

    if (existing) {
      return existing;
    }

    const user = await client.user.findUnique({
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

  private validateConfirmedProviderPayment(
    providerOrder: any,
    paymentSession: any,
    expectedStripeAccountId: string,
    confirmation?: PaymentConfirmationPayload,
  ) {
    if (!confirmation) {
      throw new ConflictException(
        'Payment confirmation payload is required for provider payment verification',
      );
    }

    const expectedAmount = Math.round(
      Number(providerOrder.subtotalAmount) * 100,
    );
    const paidAmount =
      confirmation.amountReceived ?? confirmation.amount ?? Number.NaN;

    if (!Number.isFinite(paidAmount) || paidAmount !== expectedAmount) {
      throw new ConflictException(
        'Payment amount does not match the expected provider order subtotal',
      );
    }

    const paidCurrency = this.normalizeCurrency(confirmation.currency);
    if (paidCurrency !== PaymentsService.DEFAULT_PROVIDER_ORDER_CURRENCY) {
      throw new ConflictException(
        'Payment currency does not match the expected provider order currency',
      );
    }

    if (!confirmation.accountId) {
      throw new ConflictException(
        'Payment account is missing from the confirmed provider payment',
      );
    }

    if (confirmation.accountId !== expectedStripeAccountId) {
      throw new ConflictException(
        'Payment account does not match the provider connected account',
      );
    }

    const metadata = confirmation.metadata ?? {};
    if (
      !metadata.orderId ||
      !metadata.providerOrderId ||
      !metadata.providerPaymentSessionId
    ) {
      throw new ConflictException(
        'Payment metadata is incomplete for provider payment verification',
      );
    }

    if (metadata.orderId !== providerOrder.order.id) {
      throw new ConflictException('Payment metadata orderId mismatch');
    }

    if (metadata.providerOrderId !== providerOrder.id) {
      throw new ConflictException('Payment metadata providerOrderId mismatch');
    }

    if (metadata.providerPaymentSessionId !== paymentSession.id) {
      throw new ConflictException(
        'Payment metadata providerPaymentSessionId mismatch',
      );
    }
  }

  async prepareProviderOrderPayment(providerOrderId: string, clientId: string) {
    const now = new Date();
    const eligibleStatuses: ProviderOrderStatus[] = [
      ProviderOrderStatus.PENDING,
      ProviderOrderStatus.PAYMENT_PENDING,
      ProviderOrderStatus.PAYMENT_READY,
    ];
    const prepared = await this.prisma.$transaction(async (tx: any) => {
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
                reservation.expiresAt < earliest
                  ? reservation.expiresAt
                  : earliest,
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
          (session) =>
            session.expiresAt && session.expiresAt.getTime() <= now.getTime(),
        )
        .map((session) => session.id);

      if (expiredSessionIds.length > 0) {
        await tx.providerPaymentSession.updateMany({
          where: {
            id: { in: expiredSessionIds },
            status: {
              in: [PaymentSessionStatus.CREATED, PaymentSessionStatus.READY],
            },
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

      const paymentAccount =
        await this.resolveActiveStripePaymentAccountWithinClient(
          tx,
          PaymentAccountOwnerType.PROVIDER,
          providerOrder.providerId,
        );

      if (!paymentAccount?.isActive) {
        throw new ConflictException(
          'Provider payment account is not active for this provider order',
        );
      }

      if (activeSession) {
        const supersededSessionIds = paymentSessions
          .filter((session) => session.id !== activeSession.id)
          .map((session) => session.id);

        if (supersededSessionIds.length > 0) {
          await tx.providerPaymentSession.updateMany({
            where: {
              id: { in: supersededSessionIds },
              status: {
                in: [PaymentSessionStatus.CREATED, PaymentSessionStatus.READY],
              },
            },
            data: {
              status: PaymentSessionStatus.EXPIRED,
            },
          });
        }

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
          orderId: providerOrder.order.id,
          subtotalAmount: providerOrder.subtotalAmount,
          externalSessionId: activeSession.externalSessionId,
          clientSecret: existingIntent.client_secret,
          stripeAccountId: paymentAccount.externalAccountId,
          expiresAt: activeSession.expiresAt,
          paymentStatus: ProviderPaymentStatus.PAYMENT_READY,
        };
      }
      await tx.providerPaymentSession.updateMany({
        where: {
          providerOrderId: providerOrder.id,
          status: {
            in: [PaymentSessionStatus.CREATED, PaymentSessionStatus.READY],
          },
        },
        data: {
          status: PaymentSessionStatus.EXPIRED,
        },
      });

      const session = await tx.providerPaymentSession.create({
        data: {
          providerOrderId: providerOrder.id,
          paymentProvider: PaymentAccountProvider.STRIPE,
          externalSessionId: null,
          paymentUrl: null,
          status: PaymentSessionStatus.CREATED,
          expiresAt: reservationExpiresAt,
        } as any,
      });

      await tx.providerOrder.update({
        where: { id: providerOrderId },
        data: {
          paymentStatus: ProviderPaymentStatus.PENDING,
          paymentReadyAt: null,
          paymentExpiresAt: reservationExpiresAt,
          paymentRef: null,
          status:
            providerOrder.status === ProviderOrderStatus.PENDING
              ? ProviderOrderStatus.PAYMENT_PENDING
              : providerOrder.status,
        },
      });

      return {
        providerOrderId: providerOrder.id,
        paymentSessionId: session.id,
        stripeAccountId: paymentAccount.externalAccountId,
        expiresAt: reservationExpiresAt,
        orderId: providerOrder.order.id,
        subtotalAmount: providerOrder.subtotalAmount,
        paymentStatus: ProviderPaymentStatus.PENDING,
      };
    });

    const metadata = this.buildProviderPaymentMetadata(
      prepared.orderId,
      prepared.providerOrderId,
      prepared.paymentSessionId,
    );

    if (prepared.externalSessionId) {
      return prepared;
    }

    let intent: Stripe.PaymentIntent;
    try {
      intent = await this.stripe.paymentIntents.create(
        {
          amount: Math.round(Number(prepared.subtotalAmount) * 100),
          currency: PaymentsService.DEFAULT_PROVIDER_ORDER_CURRENCY,
          automatic_payment_methods: { enabled: true },
          metadata,
        },
        {
          stripeAccount: prepared.stripeAccountId,
          idempotencyKey: `provider-payment-session:${prepared.paymentSessionId}`,
        },
      );
    } catch (error) {
      await this.prisma.providerPaymentSession.updateMany({
        where: {
          id: prepared.paymentSessionId,
          status: PaymentSessionStatus.CREATED,
        },
        data: {
          status: PaymentSessionStatus.FAILED,
        },
      });
      await this.prisma.providerOrder.updateMany({
        where: {
          id: prepared.providerOrderId,
          paymentStatus: ProviderPaymentStatus.PENDING,
        },
        data: {
          paymentStatus: ProviderPaymentStatus.PENDING,
          status: ProviderOrderStatus.PENDING,
        },
      });
      throw error;
    }

    try {
      return await this.prisma.$transaction(async (tx: any) => {
        await tx.$executeRaw(
          Prisma.sql`SELECT 1 FROM "ProviderOrder" WHERE "id" = ${prepared.providerOrderId}::uuid FOR UPDATE`,
        );

        const providerOrder = await tx.providerOrder.findUnique({
          where: { id: prepared.providerOrderId },
          include: {
            reservations: {
              where: {
                status: 'ACTIVE',
                expiresAt: { gt: new Date() },
              },
              select: {
                expiresAt: true,
              },
            },
          },
        });

        if (!providerOrder) {
          throw new NotFoundException('ProviderOrder not found');
        }

        if (providerOrder.paymentStatus === ProviderPaymentStatus.PAID) {
          throw new ConflictException('ProviderOrder is already paid');
        }

        if (providerOrder.reservations.length === 0) {
          throw new ConflictException(
            'ProviderOrder has no active stock reservation for payment',
          );
        }

        const session = await tx.providerPaymentSession.findUnique({
          where: { id: prepared.paymentSessionId },
        });

        if (!session || session.status !== PaymentSessionStatus.CREATED) {
          throw new ConflictException(
            'ProviderPaymentSession is no longer eligible for activation',
          );
        }

        const paymentExpiresAt = providerOrder.reservations.reduce(
          (earliest: Date, reservation: { expiresAt: Date }) =>
            reservation.expiresAt < earliest ? reservation.expiresAt : earliest,
          providerOrder.reservations[0].expiresAt,
        );

        await tx.providerPaymentSession.update({
          where: { id: prepared.paymentSessionId },
          data: {
            externalSessionId: intent.id,
            paymentUrl: null,
            status: PaymentSessionStatus.READY,
            expiresAt: paymentExpiresAt,
            providerResponsePayload: {
              stripeAccountId: prepared.stripeAccountId,
              paymentIntentId: intent.id,
              livemode: Boolean((intent as any).livemode ?? false),
              metadata,
            },
          } as any,
        });

        await tx.providerOrder.update({
          where: { id: prepared.providerOrderId },
          data: {
            paymentStatus: ProviderPaymentStatus.PAYMENT_READY,
            paymentReadyAt: new Date(),
            paymentExpiresAt: paymentExpiresAt,
            paymentRef: intent.id,
            status: ProviderOrderStatus.PAYMENT_READY,
          },
        });

        return {
          providerOrderId: prepared.providerOrderId,
          paymentSessionId: prepared.paymentSessionId,
          externalSessionId: intent.id,
          clientSecret: intent.client_secret,
          stripeAccountId: prepared.stripeAccountId,
          expiresAt: paymentExpiresAt,
          paymentStatus: ProviderPaymentStatus.PAYMENT_READY,
        };
      });
    } catch (error) {
      try {
        await this.stripe.paymentIntents.cancel(intent.id, {
          stripeAccount: prepared.stripeAccountId,
        });
      } catch {
        this.logger.warn(
          `Failed to cancel orphaned provider payment intent ${intent.id}`,
        );
      }

      await this.prisma.providerPaymentSession.updateMany({
        where: {
          id: prepared.paymentSessionId,
          status: {
            in: [PaymentSessionStatus.CREATED, PaymentSessionStatus.READY],
          },
        },
        data: {
          status: PaymentSessionStatus.FAILED,
        },
      });

      throw error;
    }
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
   * Prepares a provider-owned Stripe Payment Intent using a connected account.
   * The charge is created directly on the Provider's Stripe Account.
   * The platform does not split, hold, transfer, or settle funds internally.
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
   * Legacy offline cash flow.
   * This path is disabled by default because it does not follow the provider
   * payment-session boundary used by the marketplace payment model.
   */
  async processCashPayment(orderId: string, clientId: string, pin: string) {
    if (
      this.configService.get<string>('ENABLE_LEGACY_CASH_PAYMENTS') !== 'true'
    ) {
      throw new ConflictException(
        'Legacy cash payments are disabled. Use provider payment sessions instead.',
      );
    }

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

    // Calculate the offline payment breakdown for the legacy response payload.
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
    confirmation?: PaymentConfirmationPayload,
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

        if (
          paymentSession.status === PaymentSessionStatus.EXPIRED ||
          paymentSession.status === PaymentSessionStatus.FAILED
        ) {
          throw new ConflictException(
            'Inactive payment session cannot be confirmed',
          );
        }

        await tx.$executeRaw(
          Prisma.sql`SELECT 1 FROM "ProviderOrder" WHERE "id" = ${paymentSession.providerOrderId}::uuid FOR UPDATE`,
        );

        await tx.$executeRaw(
          Prisma.sql`SELECT 1 FROM "StockReservation" WHERE "providerOrderId" = ${paymentSession.providerOrderId}::uuid FOR UPDATE`,
        );

        const providerOrder = await tx.providerOrder.findUnique({
          where: { id: paymentSession.providerOrderId },
          include: {
            order: {
              select: {
                id: true,
                status: true,
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

        if (
          providerOrder.paymentRef &&
          providerOrder.paymentRef !== externalSessionId
        ) {
          throw new ConflictException(
            'Superseded payment session cannot be confirmed',
          );
        }

        if (paymentSession.status === PaymentSessionStatus.COMPLETED) {
          return {
            message: 'Provider payment session already completed',
            status: providerOrder.status,
          };
        }

        if (providerOrder.paymentStatus === ProviderPaymentStatus.PAID) {
          return {
            message: 'ProviderOrder already paid',
            status: providerOrder.status,
          };
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

        const paymentAccount =
          await this.resolveActiveStripePaymentAccountWithinClient(
            tx,
            PaymentAccountOwnerType.PROVIDER,
            providerOrder.providerId,
          );

        if (!paymentAccount?.externalAccountId) {
          throw new ConflictException(
            'Provider payment account is not active for this provider order',
          );
        }

        this.validateConfirmedProviderPayment(
          providerOrder,
          paymentSession,
          paymentAccount.externalAccountId,
          confirmation,
        );

        await tx.$executeRaw(
          Prisma.sql`SELECT 1 FROM "Order" WHERE "id" = ${providerOrder.order.id}::uuid FOR UPDATE`,
        );

        const productIds = [
          ...new Set(
            providerOrder.reservations.map(
              (reservation: any) => reservation.productId,
            ),
          ),
        ].sort();

        await tx.$executeRaw(
          Prisma.sql`SELECT 1 FROM "Product" WHERE "id" IN (${Prisma.join(
            productIds.map((id) => Prisma.sql`${id}::uuid`),
          )}) FOR UPDATE`,
        );

        const reservationIds = providerOrder.reservations.map(
          (reservation: any) => reservation.id,
        );

        const consumedReservations = await tx.stockReservation.updateMany({
          where: {
            id: {
              in: reservationIds,
            },
            providerOrderId: providerOrder.id,
            status: 'ACTIVE',
          },
          data: {
            status: 'CONSUMED',
          },
        });

        if (consumedReservations.count !== reservationIds.length) {
          throw new ConflictException(
            'Reservations changed during payment confirmation',
          );
        }

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

        await tx.providerPaymentSession.update({
          where: { id: paymentSession.id },
          data: {
            status: PaymentSessionStatus.COMPLETED,
          },
        });

        await tx.providerOrder.update({
          where: { id: providerOrder.id },
          data: {
            paymentStatus: ProviderPaymentStatus.PAID,
            status: ProviderOrderStatus.PAID,
            paidAt: now,
          },
        });

        const refreshedOrder = await tx.order.findUnique({
          where: { id: providerOrder.order.id },
          select: {
            id: true,
            status: true,
            providerOrders: {
              select: {
                id: true,
                paymentStatus: true,
              },
            },
          },
        });

        if (!refreshedOrder) {
          throw new NotFoundException('Order not found');
        }

        const allProviderOrdersPaid = refreshedOrder.providerOrders.every(
          (sibling: any) =>
            sibling.paymentStatus === ProviderPaymentStatus.PAID,
        );

        let updatedOrderStatus = refreshedOrder.status;
        if (
          allProviderOrdersPaid &&
          refreshedOrder.status === DeliveryStatus.PENDING
        ) {
          updatedOrderStatus = DeliveryStatus.CONFIRMED;
          await tx.order.update({
            where: { id: refreshedOrder.id },
            data: {
              status: DeliveryStatus.CONFIRMED,
              confirmedAt: now,
            },
          });
        }

        return {
          success: true,
          orderId: refreshedOrder.id,
          providerOrderId: providerOrder.id,
          status: updatedOrderStatus,
          paymentStatus: ProviderPaymentStatus.PAID,
          paymentRef: externalSessionId,
          _events: {
            stateChanged: {
              orderId: refreshedOrder.id,
              status: updatedOrderStatus,
              paymentRef: externalSessionId,
            },
            partialCancelled: null,
          },
        };
      });

      if (result?._events) {
        this.eventEmitter.emit(
          'order.stateChanged',
          result._events.stateChanged,
        );
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

  /**
   * @deprecated Legacy root-order payment wrapper.
   * Use confirmProviderOrderPayment(externalSessionId, eventId, eventType) instead.
   * This wrapper is restricted to single-provider orders only.
   */
  async confirmPayment(orderId: string, paymentRef: string, eventId: string) {
    if (await this.isProcessed(eventId)) {
      return { message: 'Webhook already processed' };
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        providerOrders: {
          select: { id: true },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.providerOrders.length !== 1) {
      throw new ConflictException(
        'Legacy payment confirmation wrapper only supports single-provider orders',
      );
    }

    this.logger.warn(
      `Deprecated confirmPayment(orderId=..., paymentRef=...) wrapper invoked for order ${orderId}`,
    );

    void paymentRef;
    throw new ConflictException(
      'Legacy payment confirmation wrapper is disabled. Use verified provider webhook confirmation instead.',
    );
  }

  async findPaymentReconciliationIssues(now = new Date()) {
    const staleBefore = new Date(
      now.getTime() - PaymentsService.STALE_WEBHOOK_RECEIVED_MS,
    );

    const [
      paidProviderOrdersPendingRootOrders,
      activeSessionsWithExpiredReservations,
      staleReceivedWebhookEvents,
      openSessions,
    ] = await Promise.all([
      this.prisma.providerOrder.findMany({
        where: {
          paymentStatus: ProviderPaymentStatus.PAID,
          order: {
            status: DeliveryStatus.PENDING,
          },
        },
        select: {
          id: true,
          orderId: true,
        },
      }),
      this.prisma.providerOrder.findMany({
        where: {
          paymentStatus: {
            in: [
              ProviderPaymentStatus.PENDING,
              ProviderPaymentStatus.PAYMENT_READY,
            ],
          },
          paymentSessions: {
            some: {
              status: {
                in: [PaymentSessionStatus.CREATED, PaymentSessionStatus.READY],
              },
            },
          },
          reservations: {
            some: {
              status: 'EXPIRED',
            },
          },
        },
        select: {
          id: true,
          orderId: true,
        },
      }),
      (this.prisma as any).paymentWebhookEvent.findMany({
        where: {
          status: PaymentsService.WEBHOOK_STATUS_RECEIVED,
          receivedAt: { lt: staleBefore },
        },
        select: {
          id: true,
          eventType: true,
          receivedAt: true,
        },
      }),
      this.prisma.providerPaymentSession.findMany({
        where: {
          status: {
            in: [PaymentSessionStatus.CREATED, PaymentSessionStatus.READY],
          },
        },
        select: {
          providerOrderId: true,
        },
      }),
    ]);

    const multipleOpenSessions = Array.from(
      openSessions.reduce((counts, session) => {
        counts.set(
          session.providerOrderId,
          (counts.get(session.providerOrderId) ?? 0) + 1,
        );
        return counts;
      }, new Map<string, number>()),
    )
      .filter(([, openSessionCount]) => openSessionCount > 1)
      .map(([providerOrderId, openSessionCount]) => ({
        providerOrderId,
        openSessionCount,
      }));

    return {
      paidProviderOrdersPendingRootOrders,
      activeSessionsWithExpiredReservations,
      staleReceivedWebhookEvents,
      multipleOpenSessions,
    };
  }
}
