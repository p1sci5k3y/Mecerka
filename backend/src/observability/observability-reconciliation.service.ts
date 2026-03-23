import {
  DeliveryStatus,
  PaymentSessionStatus,
  ProviderPaymentStatus,
  RefundStatus,
  RunnerPaymentStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ObservabilityReconciliation,
  ObservabilityWindow,
  ReconciliationCheckResult,
} from './observability.types';

export class ObservabilityReconciliationService {
  private static readonly SAMPLE_LIMIT = 10;

  constructor(private readonly prisma: PrismaService) {}

  private buildCheck(
    checkName: string,
    affectedCount: number,
    sampleIds: string[],
    checkedAt: Date,
    statusWhenAffected: 'WARNING' | 'ERROR' = 'ERROR',
  ): ReconciliationCheckResult {
    return {
      checkName,
      status: affectedCount > 0 ? statusWhenAffected : 'OK',
      affectedCount,
      sampleIds: sampleIds.slice(
        0,
        ObservabilityReconciliationService.SAMPLE_LIMIT,
      ),
      checkedAt,
    };
  }

  async getReconciliation(
    window: ObservabilityWindow,
    windowStart: Date,
    generatedAt: Date,
  ): Promise<ObservabilityReconciliation> {
    const [
      paidProviderOrdersWithoutSessionCount,
      paidProviderOrdersWithoutSessionSample,
      paidProviderOrdersWithIncompleteRootOrderCount,
      paidProviderOrdersWithIncompleteRootOrderSample,
      paidRunnerDeliveriesWithoutCompletedSessionCount,
      paidRunnerDeliveriesWithoutCompletedSessionSample,
      completedRefundsWithoutBoundaryCount,
      completedRefundsWithoutBoundarySample,
    ] = await Promise.all([
      this.prisma.providerOrder.count({
        where: {
          paymentStatus: ProviderPaymentStatus.PAID,
          OR: [
            { paidAt: { gte: windowStart } },
            { paidAt: null, updatedAt: { gte: windowStart } },
          ],
          paymentSessions: {
            none: {
              status: PaymentSessionStatus.COMPLETED,
            },
          },
        },
      }),
      this.prisma.providerOrder.findMany({
        where: {
          paymentStatus: ProviderPaymentStatus.PAID,
          OR: [
            { paidAt: { gte: windowStart } },
            { paidAt: null, updatedAt: { gte: windowStart } },
          ],
          paymentSessions: {
            none: {
              status: PaymentSessionStatus.COMPLETED,
            },
          },
        },
        select: {
          id: true,
        },
        take: ObservabilityReconciliationService.SAMPLE_LIMIT,
      }),
      this.prisma.providerOrder.count({
        where: {
          paymentStatus: ProviderPaymentStatus.PAID,
          OR: [
            { paidAt: { gte: windowStart } },
            { paidAt: null, updatedAt: { gte: windowStart } },
          ],
          order: {
            status: {
              notIn: [
                DeliveryStatus.CONFIRMED,
                DeliveryStatus.ASSIGNED,
                DeliveryStatus.IN_TRANSIT,
                DeliveryStatus.DELIVERED,
              ],
            },
          },
        },
      }),
      this.prisma.providerOrder.findMany({
        where: {
          paymentStatus: ProviderPaymentStatus.PAID,
          OR: [
            { paidAt: { gte: windowStart } },
            { paidAt: null, updatedAt: { gte: windowStart } },
          ],
          order: {
            status: {
              notIn: [
                DeliveryStatus.CONFIRMED,
                DeliveryStatus.ASSIGNED,
                DeliveryStatus.IN_TRANSIT,
                DeliveryStatus.DELIVERED,
              ],
            },
          },
        },
        select: {
          id: true,
        },
        take: ObservabilityReconciliationService.SAMPLE_LIMIT,
      }),
      this.prisma.deliveryOrder.count({
        where: {
          paymentStatus: RunnerPaymentStatus.PAID,
          OR: [
            { paidAt: { gte: windowStart } },
            { paidAt: null, updatedAt: { gte: windowStart } },
          ],
          paymentSessions: {
            none: {
              status: PaymentSessionStatus.COMPLETED,
            },
          },
        },
      }),
      this.prisma.deliveryOrder.findMany({
        where: {
          paymentStatus: RunnerPaymentStatus.PAID,
          OR: [
            { paidAt: { gte: windowStart } },
            { paidAt: null, updatedAt: { gte: windowStart } },
          ],
          paymentSessions: {
            none: {
              status: PaymentSessionStatus.COMPLETED,
            },
          },
        },
        select: {
          id: true,
        },
        take: ObservabilityReconciliationService.SAMPLE_LIMIT,
      }),
      this.prisma.refundRequest.count({
        where: {
          status: RefundStatus.COMPLETED,
          completedAt: {
            gte: windowStart,
          },
          providerOrderId: null,
          deliveryOrderId: null,
        },
      }),
      this.prisma.refundRequest.findMany({
        where: {
          status: RefundStatus.COMPLETED,
          completedAt: {
            gte: windowStart,
          },
          providerOrderId: null,
          deliveryOrderId: null,
        },
        select: {
          id: true,
        },
        take: ObservabilityReconciliationService.SAMPLE_LIMIT,
      }),
    ]);

    return {
      window,
      windowStart,
      checkedAt: generatedAt,
      checks: [
        this.buildCheck(
          'every paid order has a payment session',
          paidProviderOrdersWithoutSessionCount,
          paidProviderOrdersWithoutSessionSample.map((row) => row.id),
          generatedAt,
          'ERROR',
        ),
        this.buildCheck(
          'every provider payout is associated with a completed order',
          paidProviderOrdersWithIncompleteRootOrderCount,
          paidProviderOrdersWithIncompleteRootOrderSample.map((row) => row.id),
          generatedAt,
          'WARNING',
        ),
        this.buildCheck(
          'every runner payment corresponds to a completed delivery',
          paidRunnerDeliveriesWithoutCompletedSessionCount,
          paidRunnerDeliveriesWithoutCompletedSessionSample.map(
            (row) => row.id,
          ),
          generatedAt,
          'WARNING',
        ),
        this.buildCheck(
          'refunded orders have corresponding refund records',
          completedRefundsWithoutBoundaryCount,
          completedRefundsWithoutBoundarySample.map((row) => row.id),
          generatedAt,
          'ERROR',
        ),
      ],
    };
  }
}
