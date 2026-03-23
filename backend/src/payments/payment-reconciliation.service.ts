import {
  DeliveryStatus,
  PaymentSessionStatus,
  ProviderPaymentStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type OpenSessionCount = {
  providerOrderId: string;
  openSessionCount: number;
};

export class PaymentReconciliationService {
  private static readonly WEBHOOK_STATUS_RECEIVED = 'RECEIVED';
  private static readonly STALE_WEBHOOK_RECEIVED_MS = 5 * 60 * 1000;

  constructor(private readonly prisma: PrismaService) {}

  async findPaymentReconciliationIssues(now = new Date()) {
    const staleBefore = new Date(
      now.getTime() - PaymentReconciliationService.STALE_WEBHOOK_RECEIVED_MS,
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
      this.prisma.paymentWebhookEvent.findMany({
        where: {
          status: PaymentReconciliationService.WEBHOOK_STATUS_RECEIVED,
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

    const multipleOpenSessions = this.buildMultipleOpenSessions(openSessions);

    return {
      paidProviderOrdersPendingRootOrders,
      activeSessionsWithExpiredReservations,
      staleReceivedWebhookEvents,
      multipleOpenSessions,
    };
  }

  private buildMultipleOpenSessions(
    openSessions: Array<{ providerOrderId: string }>,
  ): OpenSessionCount[] {
    return Array.from(
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
  }
}
