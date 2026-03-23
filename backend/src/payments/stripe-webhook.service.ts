import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  DeliveryStatus,
  PaymentAccountOwnerType,
  PaymentAccountProvider,
  PaymentSessionStatus,
  Prisma,
  ProviderOrderStatus,
  ProviderPaymentStatus,
} from '@prisma/client';

export type PaymentConfirmationPayload = {
  amount?: number | null;
  amountReceived?: number | null;
  currency?: string | null;
  accountId?: string | null;
  metadata?: Record<string, string | undefined> | null;
};

@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);

  private static readonly WEBHOOK_STATUS_RECEIVED = 'RECEIVED';
  private static readonly WEBHOOK_STATUS_PROCESSED = 'PROCESSED';
  private static readonly WEBHOOK_STATUS_IGNORED = 'IGNORED';
  private static readonly WEBHOOK_STATUS_FAILED = 'FAILED';
  private static readonly STALE_WEBHOOK_RECEIVED_MS = 5 * 60 * 1000;
  private static readonly FINAL_WEBHOOK_STATUSES = new Set<string>([
    StripeWebhookService.WEBHOOK_STATUS_PROCESSED,
    StripeWebhookService.WEBHOOK_STATUS_IGNORED,
  ]);
  private static readonly DEFAULT_PROVIDER_ORDER_CURRENCY = 'eur';

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async isProcessed(eventId: string): Promise<boolean> {
    const event = await (this.prisma as any).paymentWebhookEvent.findUnique({
      where: { id: eventId },
      select: { status: true },
    });
    return event
      ? StripeWebhookService.FINAL_WEBHOOK_STATUSES.has(event.status ?? '')
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
          status: StripeWebhookService.WEBHOOK_STATUS_RECEIVED,
        },
      });
      return true;
    } catch (error: unknown) {
      if ((error as { code?: string }).code === 'P2002') {
        const staleBefore = new Date(
          Date.now() - StripeWebhookService.STALE_WEBHOOK_RECEIVED_MS,
        );
        const reclaimed = await (
          this.prisma as any
        ).paymentWebhookEvent.updateMany({
          where: {
            id: eventId,
            OR: [
              { status: StripeWebhookService.WEBHOOK_STATUS_FAILED },
              {
                status: StripeWebhookService.WEBHOOK_STATUS_RECEIVED,
                receivedAt: { lt: staleBefore },
              },
            ],
          },
          data: {
            provider,
            eventType,
            status: StripeWebhookService.WEBHOOK_STATUS_RECEIVED,
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

  private normalizeCurrency(value?: string | null) {
    return value?.trim().toLowerCase() ?? null;
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
    if (paidCurrency !== StripeWebhookService.DEFAULT_PROVIDER_ORDER_CURRENCY) {
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
          ? StripeWebhookService.WEBHOOK_STATUS_IGNORED
          : StripeWebhookService.WEBHOOK_STATUS_PROCESSED,
        new Date(),
      );

      return result;
    } catch (error) {
      await this.markWebhookEventStatus(
        eventId,
        StripeWebhookService.WEBHOOK_STATUS_FAILED,
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
}
