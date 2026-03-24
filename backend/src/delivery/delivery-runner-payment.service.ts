import { ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeliveryOrderStatus,
  PaymentAccountProvider,
  PaymentAccount,
  PaymentSessionStatus,
  Prisma,
  RiskActorType,
  RiskCategory,
  Role,
  RunnerPaymentStatus,
} from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import {
  DeliveryRunnerWebhookService,
  RunnerPaymentConfirmationResult,
  RunnerPaymentFailureResult,
} from './delivery-runner-webhook.service';

type ClientAccessAsserter = (
  clientId: string,
  userId: string,
  roles: Role[],
) => void;

type PaymentAccountResolver = (
  runnerId: string,
) => Promise<PaymentAccount | null>;

type RiskEmitter = (
  actorType: RiskActorType,
  actorId: string,
  category: RiskCategory,
  score: number,
  dedupKey: string,
  metadata?: Record<string, string | number | boolean>,
) => Promise<void>;

type RunnerPaymentSessionResult = {
  deliveryOrderId: string;
  runnerPaymentSessionId: string;
  externalSessionId: string;
  clientSecret: string | null;
  stripeAccountId: string;
  expiresAt: Date | null;
  paymentStatus: RunnerPaymentStatus;
};

export class DeliveryRunnerPaymentService {
  private stripe: Stripe | null = null;
  private static readonly DEMO_RUNNER_PAYMENT_UNAVAILABLE_MESSAGE =
    'Este entorno demo no puede preparar el pago Stripe del reparto. El importe y el estado del reparto siguen siendo válidos, pero el cobro requiere credenciales Stripe operativas.';

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly logger: Logger,
    private readonly assertClientOrAdminAccess: ClientAccessAsserter,
    private readonly resolveActiveRunnerStripePaymentAccount: PaymentAccountResolver,
    private readonly emitRiskEvent: RiskEmitter,
    private readonly runnerWebhookService: DeliveryRunnerWebhookService,
  ) {}

  async prepareRunnerPayment(
    deliveryOrderId: string,
    userId: string,
    roles: Role[],
  ): Promise<RunnerPaymentSessionResult> {
    const now = new Date();
    const stripe = this.getStripeClient();

    return this.prisma.$transaction<RunnerPaymentSessionResult>(
      async (tx: Prisma.TransactionClient) => {
        await tx.$executeRaw(
          Prisma.sql`SELECT 1 FROM "DeliveryOrder" WHERE "id" = ${deliveryOrderId}::uuid FOR UPDATE`,
        );

        const deliveryOrder = await tx.deliveryOrder.findUnique({
          where: { id: deliveryOrderId },
          include: {
            order: {
              select: {
                id: true,
                clientId: true,
              },
            },
            paymentSessions: {
              where: {
                status: {
                  in: [
                    PaymentSessionStatus.CREATED,
                    PaymentSessionStatus.READY,
                  ],
                },
              },
              orderBy: { createdAt: 'desc' },
            },
          },
        });

        if (!deliveryOrder) {
          throw new NotFoundException('DeliveryOrder not found');
        }

        this.assertClientOrAdminAccess(
          deliveryOrder.order.clientId,
          userId,
          roles,
        );

        if (!deliveryOrder.runnerId) {
          throw new ConflictException(
            'DeliveryOrder does not have an assigned runner',
          );
        }

        const eligibleStatuses: DeliveryOrderStatus[] = [
          DeliveryOrderStatus.RUNNER_ASSIGNED,
          DeliveryOrderStatus.PICKUP_PENDING,
        ];
        if (!eligibleStatuses.includes(deliveryOrder.status)) {
          throw new ConflictException(
            'DeliveryOrder is not eligible for payment preparation',
          );
        }

        if (deliveryOrder.paymentStatus === RunnerPaymentStatus.PAID) {
          throw new ConflictException('DeliveryOrder is already paid');
        }

        const paymentAccount =
          await this.resolveActiveRunnerStripePaymentAccount(
            deliveryOrder.runnerId,
          );
        if (!paymentAccount?.isActive) {
          throw new ConflictException(
            'Runner payment account is not active for this delivery order',
          );
        }
        if (!paymentAccount.externalAccountId) {
          throw new ConflictException(
            'Runner payment account is missing a connected Stripe account identifier',
          );
        }

        const expiredSessionIds = deliveryOrder.paymentSessions
          .filter(
            (session) =>
              session.expiresAt && session.expiresAt.getTime() <= now.getTime(),
          )
          .map((session) => session.id);

        if (expiredSessionIds.length > 0) {
          await tx.runnerPaymentSession.updateMany({
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

        const activeSession = deliveryOrder.paymentSessions.find(
          (
            session,
          ): session is typeof session & {
            externalSessionId: string;
          } =>
            session.status === PaymentSessionStatus.READY &&
            Boolean(session.externalSessionId) &&
            (!session.expiresAt || session.expiresAt.getTime() > now.getTime()),
        );

        if (activeSession) {
          const existingIntent = await stripe.paymentIntents.retrieve(
            activeSession.externalSessionId,
            {
              stripeAccount: paymentAccount.externalAccountId,
            },
          );

          await tx.deliveryOrder.update({
            where: { id: deliveryOrderId },
            data: {
              paymentStatus: RunnerPaymentStatus.PAYMENT_READY,
            },
          });

          return {
            deliveryOrderId: deliveryOrder.id,
            runnerPaymentSessionId: activeSession.id,
            externalSessionId: activeSession.externalSessionId,
            clientSecret: existingIntent.client_secret,
            stripeAccountId: paymentAccount.externalAccountId,
            expiresAt: activeSession.expiresAt,
            paymentStatus: RunnerPaymentStatus.PAYMENT_READY,
          };
        }

        const intent = await stripe.paymentIntents.create(
          {
            amount: Math.round(Number(deliveryOrder.deliveryFee) * 100),
            currency: deliveryOrder.currency.toLowerCase(),
            automatic_payment_methods: { enabled: true },
            metadata: {
              orderId: deliveryOrder.order.id,
              deliveryOrderId: deliveryOrder.id,
              runnerId: deliveryOrder.runnerId,
            },
          },
          {
            stripeAccount: paymentAccount.externalAccountId,
          },
        );

        const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);
        const session = await tx.runnerPaymentSession.create({
          data: {
            deliveryOrderId: deliveryOrder.id,
            paymentProvider: PaymentAccountProvider.STRIPE,
            externalSessionId: intent.id,
            paymentUrl: null,
            status: PaymentSessionStatus.READY,
            expiresAt,
            providerMetadata: {
              stripeAccountId: paymentAccount.externalAccountId,
              paymentIntentId: intent.id,
              livemode: Boolean(intent.livemode ?? false),
            },
          },
        });

        await tx.deliveryOrder.update({
          where: { id: deliveryOrderId },
          data: {
            paymentStatus: RunnerPaymentStatus.PAYMENT_READY,
          },
        });

        return {
          deliveryOrderId: deliveryOrder.id,
          runnerPaymentSessionId: session.id,
          externalSessionId: intent.id,
          clientSecret: intent.client_secret,
          stripeAccountId: paymentAccount.externalAccountId,
          expiresAt,
          paymentStatus: RunnerPaymentStatus.PAYMENT_READY,
        };
      },
    );
  }

  async confirmRunnerPayment(
    externalSessionId: string,
    eventId?: string,
  ): Promise<RunnerPaymentConfirmationResult> {
    return this.runnerWebhookService.confirmRunnerPayment(
      externalSessionId,
      eventId,
    );
  }

  async failRunnerPayment(
    externalSessionId: string,
    eventId?: string,
  ): Promise<RunnerPaymentFailureResult> {
    return this.runnerWebhookService.failRunnerPayment(
      externalSessionId,
      eventId,
    );
  }

  private getStripeClient() {
    if (this.stripe) {
      return this.stripe;
    }

    const demoMode = this.configService.get<string>('DEMO_MODE') === 'true';
    const stripeSecretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (
      !stripeSecretKey ||
      (demoMode && stripeSecretKey.trim().includes('dummy'))
    ) {
      throw new ConflictException(
        demoMode
          ? DeliveryRunnerPaymentService.DEMO_RUNNER_PAYMENT_UNAVAILABLE_MESSAGE
          : 'Stripe is not configured for delivery payments',
      );
    }

    this.stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2026-02-25.clover',
    });

    return this.stripe;
  }
}
