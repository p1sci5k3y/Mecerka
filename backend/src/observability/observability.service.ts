import { Injectable } from '@nestjs/common';
import {
  DeliveryIncidentStatus,
  DeliveryOrderStatus,
  DeliveryStatus,
  PaymentSessionStatus,
  ProviderPaymentStatus,
  RefundStatus,
  RiskLevel,
  RunnerPaymentStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_OBSERVABILITY_WINDOW,
  OBSERVABILITY_WINDOWS,
  ObservabilityMetrics,
  ObservabilityReconciliation,
  ObservabilitySlaMetrics,
  ObservabilityWindow,
  ReconciliationCheckResult,
} from './observability.types';

@Injectable()
export class ObservabilityService {
  private static readonly SAMPLE_LIMIT = 10;

  constructor(private readonly prisma: PrismaService) {}

  private normalizeWindow(window?: ObservabilityWindow): ObservabilityWindow {
    return window ?? DEFAULT_OBSERVABILITY_WINDOW;
  }

  private getWindowStart(window?: ObservabilityWindow, now = new Date()) {
    const normalizedWindow = this.normalizeWindow(window);
    return {
      window: normalizedWindow,
      windowStart: new Date(
        now.getTime() - OBSERVABILITY_WINDOWS[normalizedWindow],
      ),
      generatedAt: now,
    };
  }

  private average(values: number[]) {
    if (values.length === 0) {
      return null;
    }

    return Math.round(
      values.reduce((sum, value) => sum + value, 0) / values.length,
    );
  }

  private median(values: number[]) {
    if (values.length === 0) {
      return null;
    }

    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
      return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
    }

    return sorted[middle];
  }

  private ratio(numerator: number, denominator: number) {
    if (denominator === 0) {
      return 0;
    }

    return Number((numerator / denominator).toFixed(4));
  }

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
      sampleIds: sampleIds.slice(0, ObservabilityService.SAMPLE_LIMIT),
      checkedAt,
    };
  }

  private async getRefundedOrderIds(windowStart: Date) {
    const [providerOrderIds, deliveryOrderIds] = await Promise.all([
      this.prisma.providerOrder.findMany({
        where: {
          refundRequests: {
            some: {
              status: RefundStatus.COMPLETED,
              completedAt: {
                gte: windowStart,
              },
            },
          },
        },
        select: {
          orderId: true,
        },
        distinct: ['orderId'],
      }),
      this.prisma.deliveryOrder.findMany({
        where: {
          refundRequests: {
            some: {
              status: RefundStatus.COMPLETED,
              completedAt: {
                gte: windowStart,
              },
            },
          },
        },
        select: {
          orderId: true,
        },
        distinct: ['orderId'],
      }),
    ]);

    return new Set(
      [...providerOrderIds, ...deliveryOrderIds]
        .map((row) => row.orderId)
        .filter((id): id is string => Boolean(id)),
    );
  }

  private async getDeliveryCompletionDurations(windowStart: Date) {
    const deliveries = await this.prisma.deliveryOrder.findMany({
      where: {
        status: DeliveryOrderStatus.DELIVERED,
        deliveredAt: {
          gte: windowStart,
        },
      },
      select: {
        deliveredAt: true,
        job: {
          select: {
            claims: {
              orderBy: {
                createdAt: 'asc',
              },
              take: 1,
              select: {
                createdAt: true,
              },
            },
          },
        },
      },
    });

    return deliveries
      .map((delivery) => {
        const acceptedAt = delivery.job?.claims[0]?.createdAt ?? null;
        if (!acceptedAt || !delivery.deliveredAt) {
          return null;
        }

        return delivery.deliveredAt.getTime() - acceptedAt.getTime();
      })
      .filter((value): value is number => value !== null && value >= 0);
  }

  async getMetrics(
    window?: ObservabilityWindow,
  ): Promise<ObservabilityMetrics> {
    const {
      window: normalizedWindow,
      windowStart,
      generatedAt,
    } = this.getWindowStart(window);

    const [
      totalOrders,
      ordersCreated,
      ordersCompleted,
      ordersCancelled,
      refundedOrderIds,
      deliveryCreated,
      deliveryCompleted,
      deliveryFailed,
      deliveryDurations,
      refundsCreated,
      refundsApproved,
      refundsRejected,
      incidentsCreated,
      incidentsResolved,
      incidentsOpen,
      highRiskActors,
      criticalRiskActors,
    ] = await Promise.all([
      this.prisma.order.count(),
      this.prisma.order.count({
        where: {
          createdAt: {
            gte: windowStart,
          },
        },
      }),
      this.prisma.order.count({
        where: {
          status: DeliveryStatus.DELIVERED,
          updatedAt: {
            gte: windowStart,
          },
        },
      }),
      this.prisma.order.count({
        where: {
          status: DeliveryStatus.CANCELLED,
          updatedAt: {
            gte: windowStart,
          },
        },
      }),
      this.getRefundedOrderIds(windowStart),
      this.prisma.deliveryOrder.count({
        where: {
          createdAt: {
            gte: windowStart,
          },
        },
      }),
      this.prisma.deliveryOrder.count({
        where: {
          status: DeliveryOrderStatus.DELIVERED,
          deliveredAt: {
            gte: windowStart,
          },
        },
      }),
      this.prisma.deliveryOrder.count({
        where: {
          status: DeliveryOrderStatus.CANCELLED,
          updatedAt: {
            gte: windowStart,
          },
        },
      }),
      this.getDeliveryCompletionDurations(windowStart),
      this.prisma.refundRequest.count({
        where: {
          createdAt: {
            gte: windowStart,
          },
        },
      }),
      this.prisma.refundRequest.count({
        where: {
          status: RefundStatus.APPROVED,
          reviewedAt: {
            gte: windowStart,
          },
        },
      }),
      this.prisma.refundRequest.count({
        where: {
          status: RefundStatus.REJECTED,
          reviewedAt: {
            gte: windowStart,
          },
        },
      }),
      this.prisma.deliveryIncident.count({
        where: {
          createdAt: {
            gte: windowStart,
          },
        },
      }),
      this.prisma.deliveryIncident.count({
        where: {
          status: DeliveryIncidentStatus.RESOLVED,
          resolvedAt: {
            gte: windowStart,
          },
        },
      }),
      this.prisma.deliveryIncident.count({
        where: {
          status: {
            in: [
              DeliveryIncidentStatus.OPEN,
              DeliveryIncidentStatus.UNDER_REVIEW,
            ],
          },
        },
      }),
      this.prisma.riskScoreSnapshot.count({
        where: {
          level: RiskLevel.HIGH,
        },
      }),
      this.prisma.riskScoreSnapshot.count({
        where: {
          level: RiskLevel.CRITICAL,
        },
      }),
    ]);

    return {
      window: normalizedWindow,
      windowStart,
      generatedAt,
      orders: {
        total: totalOrders,
        created: ordersCreated,
        completed: ordersCompleted,
        cancelled: ordersCancelled,
        refunded: refundedOrderIds.size,
      },
      delivery: {
        created: deliveryCreated,
        completed: deliveryCompleted,
        failed: deliveryFailed,
        averageCompletionTimeMs: this.average(deliveryDurations),
        failureRate: this.ratio(deliveryFailed, deliveryCreated),
      },
      refunds: {
        created: refundsCreated,
        approved: refundsApproved,
        rejected: refundsRejected,
        approvalRatio: this.ratio(
          refundsApproved,
          refundsApproved + refundsRejected,
        ),
      },
      incidents: {
        created: incidentsCreated,
        resolved: incidentsResolved,
        open: incidentsOpen,
      },
      risk: {
        high: highRiskActors,
        critical: criticalRiskActors,
      },
    };
  }

  async getSlaMetrics(
    window?: ObservabilityWindow,
  ): Promise<ObservabilitySlaMetrics> {
    const {
      window: normalizedWindow,
      windowStart,
      generatedAt,
    } = this.getWindowStart(window);

    const [durations, completedDeliveriesCount, failedDeliveriesCount] =
      await Promise.all([
        this.getDeliveryCompletionDurations(windowStart),
        this.prisma.deliveryOrder.count({
          where: {
            status: DeliveryOrderStatus.DELIVERED,
            deliveredAt: {
              gte: windowStart,
            },
          },
        }),
        this.prisma.deliveryOrder.count({
          where: {
            status: DeliveryOrderStatus.CANCELLED,
            updatedAt: {
              gte: windowStart,
            },
          },
        }),
      ]);

    const resolvedDeliveries = completedDeliveriesCount + failedDeliveriesCount;

    return {
      window: normalizedWindow,
      windowStart,
      generatedAt,
      averageDeliveryCompletionTimeMs: this.average(durations),
      medianDeliveryCompletionTimeMs: this.median(durations),
      deliverySuccessRate: this.ratio(
        completedDeliveriesCount,
        resolvedDeliveries,
      ),
      deliveryFailureRate: this.ratio(
        failedDeliveriesCount,
        resolvedDeliveries,
      ),
      completedDeliveriesCount,
      failedDeliveriesCount,
    };
  }

  async getReconciliation(
    window?: ObservabilityWindow,
  ): Promise<ObservabilityReconciliation> {
    const {
      window: normalizedWindow,
      windowStart,
      generatedAt,
    } = this.getWindowStart(window);

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
        take: ObservabilityService.SAMPLE_LIMIT,
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
        take: ObservabilityService.SAMPLE_LIMIT,
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
        take: ObservabilityService.SAMPLE_LIMIT,
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
        take: ObservabilityService.SAMPLE_LIMIT,
      }),
    ]);

    return {
      window: normalizedWindow,
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
