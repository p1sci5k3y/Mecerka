import {
  Injectable,
  Inject,
  Logger,
  ConflictException,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IPaymentAccountRepository } from './repositories/payment-account.repository.interface';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  DeliveryOrderStatus,
  DeliveryStatus,
  PaymentAccountOwnerType,
  PaymentAccountProvider,
  PaymentSessionStatus,
  ProviderOrderStatus,
  ProviderPaymentStatus,
  Prisma,
  Role,
  RunnerPaymentStatus,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import * as argon2 from 'argon2';
import {
  StripeWebhookService,
  PaymentConfirmationPayload,
} from './stripe-webhook.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private static readonly WEBHOOK_STATUS_RECEIVED = 'RECEIVED';
  private static readonly DEFAULT_PROVIDER_ORDER_CURRENCY = 'eur';
  private static readonly DEMO_PROVIDER_PAYMENT_UNAVAILABLE_MESSAGE =
    'Este entorno demo no puede preparar pagos Stripe reales por comercio. El pedido y sus subpedidos siguen siendo válidos, pero el cobro requiere credenciales Stripe operativas.';
  private static readonly STALE_WEBHOOK_RECEIVED_MS = 5 * 60 * 1000;

  private readonly stripe: Stripe;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
    private readonly stripeWebhookService: StripeWebhookService,
    @Inject(IPaymentAccountRepository)
    private readonly paymentAccountRepository: IPaymentAccountRepository,
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
    return this.stripeWebhookService.isProcessed(eventId);
  }

  private buildAggregateProviderPaymentStatus(providerOrders: any[]) {
    const inactiveProviderStatuses = new Set<ProviderOrderStatus>([
      ProviderOrderStatus.REJECTED,
      ProviderOrderStatus.REJECTED_BY_STORE,
      ProviderOrderStatus.CANCELLED,
      ProviderOrderStatus.EXPIRED,
      ProviderOrderStatus.DELIVERED,
    ]);

    const payableProviderOrders = providerOrders.filter(
      (providerOrder) => !inactiveProviderStatuses.has(providerOrder.status),
    );

    if (payableProviderOrders.length === 0) {
      return {
        status: 'PAID',
        paidProviderOrders: 0,
        totalProviderOrders: 0,
      };
    }

    const paidProviderOrders = payableProviderOrders.filter(
      (providerOrder) =>
        providerOrder.paymentStatus === ProviderPaymentStatus.PAID,
    ).length;

    if (paidProviderOrders === 0) {
      return {
        status: 'UNPAID',
        paidProviderOrders,
        totalProviderOrders: payableProviderOrders.length,
      };
    }

    if (paidProviderOrders === payableProviderOrders.length) {
      return {
        status: 'PAID',
        paidProviderOrders,
        totalProviderOrders: payableProviderOrders.length,
      };
    }

    return {
      status: 'PARTIALLY_PAID',
      paidProviderOrders,
      totalProviderOrders: payableProviderOrders.length,
    };
  }

  private roundMoney(value: number) {
    return Number(value.toFixed(2));
  }

  private isDemoStripeCheckoutUnavailable() {
    const demoMode = this.configService.get<string>('DEMO_MODE') === 'true';
    const stripeSecretKey =
      this.configService.get<string>('STRIPE_SECRET_KEY')?.trim() ?? '';

    return demoMode && (!stripeSecretKey || stripeSecretKey.includes('dummy'));
  }

  private buildRunnerPaymentSummary(order: any) {
    const deliveryOrder = order.deliveryOrder;
    const pickupCount = order.providerOrders.length;
    const additionalPickupCount = Math.max(pickupCount - 1, 0);
    const pricingDistanceKm =
      order.deliveryDistanceKm != null ? Number(order.deliveryDistanceKm) : 0;
    const baseFee =
      order.runnerBaseFee != null ? Number(order.runnerBaseFee) : 0;
    const perKmFee =
      order.runnerPerKmFee != null ? Number(order.runnerPerKmFee) : 0;
    const extraPickupFee =
      order.runnerExtraPickupFee != null
        ? Number(order.runnerExtraPickupFee)
        : 0;
    const distanceFee = this.roundMoney(pricingDistanceKm * perKmFee);
    const extraPickupCharge = this.roundMoney(
      additionalPickupCount * extraPickupFee,
    );
    const amount = order.deliveryFee != null ? Number(order.deliveryFee) : 0;
    const pricing = {
      amount: this.roundMoney(amount),
      currency: deliveryOrder?.currency ?? 'EUR',
      pricingDistanceKm: this.roundMoney(pricingDistanceKm),
      pickupCount,
      additionalPickupCount,
      baseFee: this.roundMoney(baseFee),
      perKmFee: this.roundMoney(perKmFee),
      distanceFee,
      extraPickupFee: this.roundMoney(extraPickupFee),
      extraPickupCharge,
    };

    if (!deliveryOrder) {
      return {
        paymentMode: 'DELIVERY_ORDER_SESSION',
        deliveryOrderId: null,
        runnerId: null,
        deliveryStatus: null,
        paymentStatus: 'NOT_CREATED',
        paymentRequired: false,
        sessionPrepared: false,
        ...pricing,
      };
    }

    const sessionPrepared = deliveryOrder.paymentSessions.some((session: any) =>
      [PaymentSessionStatus.CREATED, PaymentSessionStatus.READY].includes(
        session.status,
      ),
    );
    const paymentRequired =
      Boolean(deliveryOrder.runnerId) &&
      deliveryOrder.paymentStatus !== RunnerPaymentStatus.PAID &&
      [
        DeliveryOrderStatus.RUNNER_ASSIGNED,
        DeliveryOrderStatus.PICKUP_PENDING,
        DeliveryOrderStatus.PICKED_UP,
        DeliveryOrderStatus.IN_TRANSIT,
      ].includes(deliveryOrder.status);

    return {
      paymentMode: 'DELIVERY_ORDER_SESSION',
      deliveryOrderId: deliveryOrder.id,
      runnerId: deliveryOrder.runnerId,
      deliveryStatus: deliveryOrder.status,
      paymentStatus: deliveryOrder.paymentStatus,
      paymentRequired,
      sessionPrepared,
      ...pricing,
    };
  }

  private buildProviderOrderDiscountSummary(providerOrder: any) {
    const originalSubtotalAmount = this.roundMoney(
      providerOrder.items.reduce(
        (sum: number, item: any) =>
          sum +
          Number(item.unitBasePriceSnapshot ?? item.priceAtPurchase) *
            item.quantity,
        0,
      ),
    );
    const subtotalAmount = this.roundMoney(
      Number(providerOrder.subtotalAmount),
    );
    const discountAmount = this.roundMoney(
      Math.max(originalSubtotalAmount - subtotalAmount, 0),
    );

    return {
      originalSubtotalAmount,
      discountAmount,
    };
  }

  async upsertPaymentAccount(
    ownerType: PaymentAccountOwnerType,
    ownerId: string,
    provider: PaymentAccountProvider,
    externalAccountId: string,
  ) {
    return this.paymentAccountRepository.upsert(
      ownerType,
      ownerId,
      provider,
      externalAccountId,
    );
  }

  async getActivePaymentAccount(
    ownerType: PaymentAccountOwnerType,
    ownerId: string,
    provider: PaymentAccountProvider,
  ) {
    return this.paymentAccountRepository.findActive(
      ownerType,
      ownerId,
      provider,
    );
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

  async prepareProviderOrderPayment(providerOrderId: string, clientId: string) {
    if (this.isDemoStripeCheckoutUnavailable()) {
      throw new ConflictException(
        PaymentsService.DEMO_PROVIDER_PAYMENT_UNAVAILABLE_MESSAGE,
      );
    }

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

  async prepareOrderProviderPayments(orderId: string, clientId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        providerOrders: {
          orderBy: { createdAt: 'asc' },
          include: {
            provider: {
              select: {
                name: true,
              },
            },
            items: {
              select: {
                quantity: true,
                priceAtPurchase: true,
                unitBasePriceSnapshot: true,
              },
            },
          },
        },
        deliveryOrder: {
          include: {
            paymentSessions: {
              where: {
                status: {
                  in: [
                    PaymentSessionStatus.CREATED,
                    PaymentSessionStatus.READY,
                  ],
                },
              },
            },
          },
        },
      },
    });

    if (!order || order.clientId !== clientId) {
      throw new NotFoundException('Order not found or not owned by client');
    }

    if (order.providerOrders.length === 0) {
      throw new ConflictException('Order has no provider items');
    }

    const aggregateProviderPayment = this.buildAggregateProviderPaymentStatus(
      order.providerOrders,
    );
    const paymentsUnavailable = this.isDemoStripeCheckoutUnavailable();

    const providerOrders = [];
    const inactiveProviderStatuses = new Set<ProviderOrderStatus>([
      ProviderOrderStatus.REJECTED,
      ProviderOrderStatus.REJECTED_BY_STORE,
      ProviderOrderStatus.CANCELLED,
      ProviderOrderStatus.EXPIRED,
      ProviderOrderStatus.DELIVERED,
    ]);

    for (const providerOrder of order.providerOrders) {
      const isSettled =
        providerOrder.paymentStatus === ProviderPaymentStatus.PAID;
      const isInactive = inactiveProviderStatuses.has(providerOrder.status);
      const pricing = this.buildProviderOrderDiscountSummary(providerOrder);

      if (isSettled || isInactive) {
        providerOrders.push({
          providerOrderId: providerOrder.id,
          providerId: providerOrder.providerId,
          providerName: providerOrder.provider.name,
          subtotalAmount: providerOrder.subtotalAmount,
          originalSubtotalAmount: pricing.originalSubtotalAmount,
          discountAmount: pricing.discountAmount,
          status: providerOrder.status,
          paymentStatus: providerOrder.paymentStatus,
          paymentRequired: false,
          paymentSession: null,
        });
        continue;
      }

      if (paymentsUnavailable) {
        providerOrders.push({
          providerOrderId: providerOrder.id,
          providerId: providerOrder.providerId,
          providerName: providerOrder.provider.name,
          subtotalAmount: providerOrder.subtotalAmount,
          originalSubtotalAmount: pricing.originalSubtotalAmount,
          discountAmount: pricing.discountAmount,
          status: providerOrder.status,
          paymentStatus: providerOrder.paymentStatus,
          paymentRequired: true,
          paymentSession: null,
        });
        continue;
      }

      const session = await this.prepareProviderOrderPayment(
        providerOrder.id,
        clientId,
      );

      providerOrders.push({
        providerOrderId: providerOrder.id,
        providerId: providerOrder.providerId,
        providerName: providerOrder.provider.name,
        subtotalAmount: providerOrder.subtotalAmount,
        originalSubtotalAmount: pricing.originalSubtotalAmount,
        discountAmount: pricing.discountAmount,
        status: ProviderOrderStatus.PAYMENT_READY,
        paymentStatus: session.paymentStatus,
        paymentRequired: true,
        paymentSession: session,
      });
    }

    return {
      orderId: order.id,
      orderStatus: order.status,
      paymentMode: 'PROVIDER_ORDER_SESSIONS',
      paymentEnvironment: paymentsUnavailable ? 'UNAVAILABLE' : 'READY',
      paymentEnvironmentMessage: paymentsUnavailable
        ? PaymentsService.DEMO_PROVIDER_PAYMENT_UNAVAILABLE_MESSAGE
        : null,
      providerPaymentStatus: aggregateProviderPayment.status,
      paidProviderOrders: aggregateProviderPayment.paidProviderOrders,
      totalProviderOrders: aggregateProviderPayment.totalProviderOrders,
      providerOrders,
      runnerPayment: this.buildRunnerPaymentSummary(order),
    };
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
    return this.stripeWebhookService.confirmProviderOrderPayment(
      externalSessionId,
      eventId,
      eventType,
      confirmation,
    );
  }

  /**
   * @deprecated Legacy root-order payment wrapper.
   * Use confirmProviderOrderPayment(externalSessionId, eventId, eventType) instead.
   * This wrapper is restricted to single-provider orders only.
   */
  async confirmPayment(orderId: string, paymentRef: string, eventId: string) {
    return this.stripeWebhookService.confirmPayment(
      orderId,
      paymentRef,
      eventId,
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
