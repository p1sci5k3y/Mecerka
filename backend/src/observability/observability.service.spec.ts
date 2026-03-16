import {
  DeliveryIncidentStatus,
  DeliveryOrderStatus,
  DeliveryStatus,
  RefundStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ObservabilityService } from './observability.service';

describe('ObservabilityService', () => {
  let service: ObservabilityService;
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      order: {
        count: jest.fn(),
      },
      providerOrder: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
      deliveryOrder: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
      refundRequest: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
      deliveryIncident: {
        count: jest.fn(),
      },
      riskScoreSnapshot: {
        count: jest.fn(),
      },
    };

    service = new ObservabilityService(prismaMock as PrismaService);
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2099-01-31T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('returns correct aggregated counts for metrics with the default 24h window', async () => {
    prismaMock.order.count
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(2);
    prismaMock.providerOrder.findMany.mockResolvedValueOnce([
      { orderId: '00000000-0000-0000-0000-000000000001' },
      { orderId: '00000000-0000-0000-0000-000000000002' },
    ]);
    prismaMock.deliveryOrder.findMany
      .mockResolvedValueOnce([
        { orderId: '00000000-0000-0000-0000-000000000002' },
        { orderId: '00000000-0000-0000-0000-000000000003' },
      ])
      .mockResolvedValueOnce([
        {
          deliveredAt: new Date('2099-01-30T12:45:00.000Z'),
          job: {
            claims: [{ createdAt: new Date('2099-01-30T12:00:00.000Z') }],
          },
        },
        {
          deliveredAt: new Date('2099-01-30T14:00:00.000Z'),
          job: {
            claims: [{ createdAt: new Date('2099-01-30T13:00:00.000Z') }],
          },
        },
      ]);
    prismaMock.deliveryOrder.count
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(6)
      .mockResolvedValueOnce(1);
    prismaMock.refundRequest.count
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);
    prismaMock.deliveryIncident.count
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2);
    prismaMock.riskScoreSnapshot.count
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(2);

    const result = await service.getMetrics();

    expect(result).toEqual({
      window: '24h',
      windowStart: new Date('2099-01-30T00:00:00.000Z'),
      generatedAt: new Date('2099-01-31T00:00:00.000Z'),
      orders: {
        total: 100,
        created: 12,
        completed: 8,
        cancelled: 2,
        refunded: 3,
      },
      delivery: {
        created: 10,
        completed: 6,
        failed: 1,
        averageCompletionTimeMs: 3150000,
        failureRate: 0.1,
      },
      refunds: {
        created: 4,
        approved: 2,
        rejected: 1,
        approvalRatio: 0.6667,
      },
      incidents: {
        created: 5,
        resolved: 3,
        open: 2,
      },
      risk: {
        high: 7,
        critical: 2,
      },
    });

    expect(prismaMock.order.count.mock.calls[1][0]).toEqual({
      where: {
        createdAt: {
          gte: new Date('2099-01-30T00:00:00.000Z'),
        },
      },
    });
  });

  it('applies explicit 7d and 30d window filtering', async () => {
    prismaMock.order.count.mockResolvedValue(0);
    prismaMock.providerOrder.findMany.mockResolvedValue([]);
    prismaMock.deliveryOrder.findMany.mockResolvedValue([]);
    prismaMock.deliveryOrder.count.mockResolvedValue(0);
    prismaMock.refundRequest.count.mockResolvedValue(0);
    prismaMock.deliveryIncident.count.mockResolvedValue(0);
    prismaMock.riskScoreSnapshot.count.mockResolvedValue(0);

    await service.getMetrics('7d');
    expect(prismaMock.order.count.mock.calls[1][0]).toEqual({
      where: {
        createdAt: {
          gte: new Date('2099-01-24T00:00:00.000Z'),
        },
      },
    });

    jest.clearAllMocks();
    prismaMock.order.count.mockResolvedValue(0);
    prismaMock.providerOrder.findMany.mockResolvedValue([]);
    prismaMock.deliveryOrder.findMany.mockResolvedValue([]);
    prismaMock.deliveryOrder.count.mockResolvedValue(0);
    prismaMock.refundRequest.count.mockResolvedValue(0);
    prismaMock.deliveryIncident.count.mockResolvedValue(0);
    prismaMock.riskScoreSnapshot.count.mockResolvedValue(0);

    await service.getMetrics('30d');
    expect(prismaMock.order.count.mock.calls[1][0]).toEqual({
      where: {
        createdAt: {
          gte: new Date('2099-01-01T00:00:00.000Z'),
        },
      },
    });
  });

  it('computes SLA averages, median, success rate, and failure rate correctly', async () => {
    prismaMock.deliveryOrder.findMany.mockResolvedValue([
      {
        deliveredAt: new Date('2099-01-30T11:00:00.000Z'),
        job: {
          claims: [{ createdAt: new Date('2099-01-30T10:00:00.000Z') }],
        },
      },
      {
        deliveredAt: new Date('2099-01-30T14:00:00.000Z'),
        job: {
          claims: [{ createdAt: new Date('2099-01-30T12:00:00.000Z') }],
        },
      },
      {
        deliveredAt: new Date('2099-01-30T18:00:00.000Z'),
        job: {
          claims: [{ createdAt: new Date('2099-01-30T15:00:00.000Z') }],
        },
      },
    ]);
    prismaMock.deliveryOrder.count
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(1);

    const result = await service.getSlaMetrics();

    expect(result).toEqual({
      window: '24h',
      windowStart: new Date('2099-01-30T00:00:00.000Z'),
      generatedAt: new Date('2099-01-31T00:00:00.000Z'),
      averageDeliveryCompletionTimeMs: 7200000,
      medianDeliveryCompletionTimeMs: 7200000,
      deliverySuccessRate: 0.75,
      deliveryFailureRate: 0.25,
      completedDeliveriesCount: 3,
      failedDeliveriesCount: 1,
    });
  });

  it('detects reconciliation mismatches and limits sampleIds to internal IDs only', async () => {
    const providerSessionIds = Array.from({ length: 12 }, (_, index) => ({
      id: `00000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`,
    }));
    const providerOrderIds = [
      { id: '10000000-0000-0000-0000-000000000001' },
      { id: '10000000-0000-0000-0000-000000000002' },
    ];
    const runnerOrderIds = [
      { id: '20000000-0000-0000-0000-000000000001' },
      { id: '20000000-0000-0000-0000-000000000002' },
    ];
    const refundIds = [{ id: '30000000-0000-0000-0000-000000000001' }];

    prismaMock.providerOrder.count
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(2);
    prismaMock.providerOrder.findMany
      .mockResolvedValueOnce(providerSessionIds)
      .mockResolvedValueOnce(providerOrderIds);
    prismaMock.deliveryOrder.count.mockResolvedValueOnce(2);
    prismaMock.deliveryOrder.findMany.mockResolvedValueOnce(runnerOrderIds);
    prismaMock.refundRequest.count.mockResolvedValueOnce(1);
    prismaMock.refundRequest.findMany.mockResolvedValueOnce(refundIds);

    const result = await service.getReconciliation();

    expect(result.window).toBe('24h');
    expect(result.checks).toEqual([
      expect.objectContaining({
        checkName: 'every paid order has a payment session',
        status: 'ERROR',
        affectedCount: 12,
        sampleIds: providerSessionIds.slice(0, 10).map((row) => row.id),
      }),
      expect.objectContaining({
        checkName: 'every provider payout is associated with a completed order',
        status: 'WARNING',
        affectedCount: 2,
        sampleIds: providerOrderIds.map((row) => row.id),
      }),
      expect.objectContaining({
        checkName: 'every runner payment corresponds to a completed delivery',
        status: 'WARNING',
        affectedCount: 2,
        sampleIds: runnerOrderIds.map((row) => row.id),
      }),
      expect.objectContaining({
        checkName: 'refunded orders have corresponding refund records',
        status: 'ERROR',
        affectedCount: 1,
        sampleIds: refundIds.map((row) => row.id),
      }),
    ]);

    for (const check of result.checks) {
      expect(Object.keys(check).sort()).toEqual(
        [
          'affectedCount',
          'checkName',
          'checkedAt',
          'sampleIds',
          'status',
        ].sort(),
      );
      expect(check.sampleIds.length).toBeLessThanOrEqual(10);
      for (const sampleId of check.sampleIds) {
        expect(sampleId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        );
      }
    }
  });

  it('returns compact responses without sensitive data fields', async () => {
    prismaMock.providerOrder.count.mockResolvedValue(0);
    prismaMock.providerOrder.findMany.mockResolvedValue([]);
    prismaMock.deliveryOrder.count.mockResolvedValue(0);
    prismaMock.deliveryOrder.findMany.mockResolvedValue([]);
    prismaMock.refundRequest.count.mockResolvedValue(0);
    prismaMock.refundRequest.findMany.mockResolvedValue([]);

    const result = await service.getReconciliation();
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain('email');
    expect(serialized).not.toContain('name');
    expect(serialized).not.toContain('address');
    expect(serialized).not.toContain('phone');
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('payload');
    expect(serialized).not.toContain('description');
  });
});
