import { PrismaService } from '../prisma/prisma.service';
import { ObservabilityReconciliationService } from './observability-reconciliation.service';

describe('ObservabilityReconciliationService', () => {
  let service: ObservabilityReconciliationService;
  let prismaMock: {
    providerOrder: { count: jest.Mock; findMany: jest.Mock };
    deliveryOrder: { count: jest.Mock; findMany: jest.Mock };
    refundRequest: { count: jest.Mock; findMany: jest.Mock };
  };

  beforeEach(() => {
    prismaMock = {
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
    };

    service = new ObservabilityReconciliationService(
      prismaMock as unknown as PrismaService,
    );
  });

  it('builds capped reconciliation checks with internal IDs only', async () => {
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

    const result = await service.getReconciliation(
      '24h',
      new Date('2099-01-30T00:00:00.000Z'),
      new Date('2099-01-31T00:00:00.000Z'),
    );

    expect(result.checks[0]?.sampleIds).toEqual(
      providerSessionIds.slice(0, 10).map((row) => row.id),
    );
    expect(result.checks[1]?.sampleIds).toEqual(
      providerOrderIds.map((row) => row.id),
    );
    expect(result.checks[2]?.sampleIds).toEqual(
      runnerOrderIds.map((row) => row.id),
    );
    expect(result.checks[3]?.sampleIds).toEqual(refundIds.map((row) => row.id));
  });

  it('returns OK checks with empty samples when reconciliation finds no issues', async () => {
    prismaMock.providerOrder.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    prismaMock.providerOrder.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prismaMock.deliveryOrder.count.mockResolvedValueOnce(0);
    prismaMock.deliveryOrder.findMany.mockResolvedValueOnce([]);
    prismaMock.refundRequest.count.mockResolvedValueOnce(0);
    prismaMock.refundRequest.findMany.mockResolvedValueOnce([]);

    const result = await service.getReconciliation(
      '24h',
      new Date('2099-01-30T00:00:00.000Z'),
      new Date('2099-01-31T00:00:00.000Z'),
    );

    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'OK',
          affectedCount: 0,
          sampleIds: [],
        }),
      ]),
    );
  });

  it('defaults affected checks to ERROR when no override status is provided', () => {
    const checkedAt = new Date('2099-01-31T00:00:00.000Z');

    const result = (
      service as unknown as {
        buildCheck: (
          checkName: string,
          affectedCount: number,
          sampleIds: string[],
          checkedAt: Date,
        ) => {
          checkName: string;
          status: string;
          affectedCount: number;
          sampleIds: string[];
          checkedAt: Date;
        };
      }
    ).buildCheck('default error branch', 2, ['id-1', 'id-2'], checkedAt);

    expect(result).toEqual({
      checkName: 'default error branch',
      status: 'ERROR',
      affectedCount: 2,
      sampleIds: ['id-1', 'id-2'],
      checkedAt,
    });
  });
});
