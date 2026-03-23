import { ConflictException, Logger, NotFoundException } from '@nestjs/common';
import {
  PaymentSessionStatus,
  Prisma,
  ProviderOrderStatus,
  ProviderPaymentStatus,
} from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { PreparedProviderOrderPayment } from './provider-payment-preparation.types';

export class ProviderPaymentIntentActivationService {
  private static readonly DEFAULT_PROVIDER_ORDER_CURRENCY = 'eur';

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: Stripe,
    private readonly logger: Logger,
  ) {}

  async activatePreparedProviderOrderPayment(
    prepared: PreparedProviderOrderPayment,
  ) {
    const preparedOrderId = prepared.orderId;
    if (!preparedOrderId) {
      throw new ConflictException(
        'Prepared provider payment is missing the parent order identifier',
      );
    }
    const preparedSubtotalAmount = prepared.subtotalAmount;
    if (preparedSubtotalAmount == null) {
      throw new ConflictException(
        'Prepared provider payment is missing the provider order subtotal',
      );
    }
    const preparedStripeAccountId = prepared.stripeAccountId;
    if (!preparedStripeAccountId) {
      throw new ConflictException(
        'Prepared provider payment is missing the Stripe connected account identifier',
      );
    }

    const metadata = this.buildProviderPaymentMetadata(
      preparedOrderId,
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
          amount: Math.round(Number(preparedSubtotalAmount) * 100),
          currency:
            ProviderPaymentIntentActivationService.DEFAULT_PROVIDER_ORDER_CURRENCY,
          automatic_payment_methods: { enabled: true },
          metadata,
        },
        {
          stripeAccount: preparedStripeAccountId,
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
      return await this.prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
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
              reservation.expiresAt < earliest
                ? reservation.expiresAt
                : earliest,
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
                livemode: Boolean(intent.livemode ?? false),
                metadata,
              },
            },
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
            stripeAccountId: preparedStripeAccountId,
            expiresAt: paymentExpiresAt,
            paymentStatus: ProviderPaymentStatus.PAYMENT_READY,
          };
        },
      );
    } catch (error) {
      try {
        await this.stripe.paymentIntents.cancel(intent.id, {
          stripeAccount: preparedStripeAccountId,
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
}
