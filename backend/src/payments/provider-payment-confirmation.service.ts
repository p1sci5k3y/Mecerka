import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  DeliveryStatus,
  PaymentAccountOwnerType,
  PaymentAccountProvider,
  PaymentSessionStatus,
  Prisma,
  ProviderOrderStatus,
  ProviderPaymentStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  PaymentConfirmationPayload,
  ProviderPaymentConfirmationResult,
} from './provider-payment-confirmation.types';
import { ProviderPaymentSettlementService } from './provider-payment-settlement.service';

type PaymentAccountResolverClient = Pick<
  Prisma.TransactionClient,
  'paymentAccount' | 'user'
>;

type PaymentSessionWithProviderOrder = Prisma.ProviderPaymentSessionGetPayload<{
  include: {
    providerOrder: {
      include: {
        items: true;
      };
    };
  };
}>;

type ConfirmableProviderOrder = Prisma.ProviderOrderGetPayload<{
  include: {
    order: {
      select: {
        id: true;
        status: true;
      };
    };
    reservations: {
      where: {
        status: 'ACTIVE';
      };
      select: {
        id: true;
        productId: true;
        quantity: true;
        expiresAt: true;
      };
    };
    items: true;
  };
}>;

@Injectable()
export class ProviderPaymentConfirmationService {
  private readonly logger = new Logger(ProviderPaymentConfirmationService.name);
  private static readonly DEFAULT_PROVIDER_ORDER_CURRENCY = 'eur';
  private readonly settlementService: ProviderPaymentSettlementService;

  constructor(private readonly prisma: PrismaService) {
    this.settlementService = new ProviderPaymentSettlementService();
  }

  async confirmProviderOrderPayment(
    externalSessionId: string,
    eventId: string,
    confirmation?: PaymentConfirmationPayload,
  ): Promise<ProviderPaymentConfirmationResult> {
    return this.prisma.$transaction<ProviderPaymentConfirmationResult>(
      async (tx: Prisma.TransactionClient) => {
        const now = new Date();

        const paymentSession: PaymentSessionWithProviderOrder | null =
          await tx.providerPaymentSession.findUnique({
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

        const providerOrder: ConfirmableProviderOrder | null =
          await tx.providerOrder.findUnique({
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
          (reservation) =>
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

        return this.settlementService.settleConfirmedProviderPayment(
          tx,
          paymentSession,
          providerOrder,
          externalSessionId,
          now,
        );
      },
    );
  }

  private normalizeCurrency(value?: string | null) {
    return value?.trim().toLowerCase() ?? null;
  }

  private async resolveActiveStripePaymentAccountWithinClient(
    client: PaymentAccountResolverClient,
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

    return this.prisma.paymentAccount.upsert({
      where: {
        ownerType_ownerId_provider: {
          ownerType,
          ownerId,
          provider: PaymentAccountProvider.STRIPE,
        },
      },
      update: {
        externalAccountId: user.stripeAccountId,
        isActive: true,
      },
      create: {
        ownerType,
        ownerId,
        provider: PaymentAccountProvider.STRIPE,
        externalAccountId: user.stripeAccountId,
        isActive: true,
      },
    });
  }

  private validateConfirmedProviderPayment(
    providerOrder: Pick<ConfirmableProviderOrder, 'id' | 'subtotalAmount'> & {
      order: Pick<ConfirmableProviderOrder['order'], 'id'>;
    },
    paymentSession: Pick<PaymentSessionWithProviderOrder, 'id'>,
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
    if (
      paidCurrency !==
      ProviderPaymentConfirmationService.DEFAULT_PROVIDER_ORDER_CURRENCY
    ) {
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
}
