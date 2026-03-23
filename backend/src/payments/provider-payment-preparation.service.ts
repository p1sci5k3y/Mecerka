import { ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PaymentAccountOwnerType,
  PaymentAccountProvider,
  PaymentSessionStatus,
  Prisma,
  ProviderOrderStatus,
  ProviderPaymentStatus,
} from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentSummaryBuilder } from './payment-summary.builder';
import { ProviderPaymentAggregateService } from './provider-payment-aggregate.service';
import { ProviderPaymentIntentActivationService } from './provider-payment-intent-activation.service';
import { PreparedProviderOrderPayment } from './provider-payment-preparation.types';

type StripeAccountResolverClient = Prisma.TransactionClient;

type ResolvedStripePaymentAccount = {
  externalAccountId: string | null;
  isActive: boolean;
} | null;

type StripeAccountResolver = (
  client: StripeAccountResolverClient,
  ownerType: PaymentAccountOwnerType,
  ownerId: string,
) => Promise<ResolvedStripePaymentAccount>;

export class ProviderPaymentPreparationService {
  private static readonly DEMO_PROVIDER_PAYMENT_UNAVAILABLE_MESSAGE =
    'Este entorno demo no puede preparar pagos Stripe reales por comercio. El pedido y sus subpedidos siguen siendo válidos, pero el cobro requiere credenciales Stripe operativas.';

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly stripe: Stripe,
    private readonly logger: Logger,
    private readonly summaryBuilder: PaymentSummaryBuilder,
    private readonly resolveActiveStripePaymentAccountWithinClient: StripeAccountResolver,
    private readonly aggregateService: ProviderPaymentAggregateService,
    private readonly intentActivationService: ProviderPaymentIntentActivationService,
  ) {}

  async prepareProviderOrderPayment(providerOrderId: string, clientId: string) {
    if (this.isDemoStripeCheckoutUnavailable()) {
      throw new ConflictException(
        ProviderPaymentPreparationService.DEMO_PROVIDER_PAYMENT_UNAVAILABLE_MESSAGE,
      );
    }

    const now = new Date();
    const eligibleStatuses: ProviderOrderStatus[] = [
      ProviderOrderStatus.PENDING,
      ProviderOrderStatus.PAYMENT_PENDING,
      ProviderOrderStatus.PAYMENT_READY,
    ];
    const prepared =
      await this.prisma.$transaction<PreparedProviderOrderPayment>(
        async (tx: Prisma.TransactionClient) => {
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
          const paymentSessions = providerOrder?.paymentSessions ?? [];

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
                session.expiresAt &&
                session.expiresAt.getTime() <= now.getTime(),
            )
            .map((session) => session.id);

          if (expiredSessionIds.length > 0) {
            await tx.providerPaymentSession.updateMany({
              where: {
                id: { in: expiredSessionIds },
                status: {
                  in: [
                    PaymentSessionStatus.CREATED,
                    PaymentSessionStatus.READY,
                  ],
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
              (!session.expiresAt ||
                session.expiresAt.getTime() > now.getTime()),
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
          const stripeAccountId = paymentAccount.externalAccountId;
          if (!stripeAccountId) {
            throw new ConflictException(
              'Provider payment account is missing a connected Stripe account identifier',
            );
          }

          if (activeSession) {
            if (!activeSession.externalSessionId) {
              throw new ConflictException(
                'Active provider payment session is missing its external Stripe payment intent',
              );
            }
            const supersededSessionIds = paymentSessions
              .filter((session) => session.id !== activeSession.id)
              .map((session) => session.id);

            if (supersededSessionIds.length > 0) {
              await tx.providerPaymentSession.updateMany({
                where: {
                  id: { in: supersededSessionIds },
                  status: {
                    in: [
                      PaymentSessionStatus.CREATED,
                      PaymentSessionStatus.READY,
                    ],
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
                stripeAccount: stripeAccountId,
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
              stripeAccountId,
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
            },
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
            stripeAccountId,
            expiresAt: reservationExpiresAt,
            orderId: providerOrder.order.id,
            subtotalAmount: providerOrder.subtotalAmount,
            paymentStatus: ProviderPaymentStatus.PENDING,
          };
        },
      );

    return this.intentActivationService.activatePreparedProviderOrderPayment(
      prepared,
    );
  }

  async prepareOrderProviderPayments(orderId: string, clientId: string) {
    return this.aggregateService.prepareOrderProviderPayments(
      orderId,
      clientId,
      this.prepareProviderOrderPayment.bind(this),
    );
  }

  private isDemoStripeCheckoutUnavailable() {
    const demoMode = this.configService.get<string>('DEMO_MODE') === 'true';
    const stripeSecretKey =
      this.configService.get<string>('STRIPE_SECRET_KEY')?.trim() ?? '';

    return demoMode && (!stripeSecretKey || stripeSecretKey.includes('dummy'));
  }
}
