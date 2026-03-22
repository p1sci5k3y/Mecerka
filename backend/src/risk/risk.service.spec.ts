import { RiskActorType, RiskCategory, RiskLevel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RiskService } from './risk.service';

describe('RiskService', () => {
  let service: RiskService;
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      riskEvent: {
        create: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      riskScoreSnapshot: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
    };

    service = new RiskService(prismaMock as PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('updates the snapshot deterministically from recent events', async () => {
    const now = new Date('2099-01-10T00:00:00.000Z');
    prismaMock.riskEvent.findMany.mockResolvedValue([
      {
        category: RiskCategory.EXCESSIVE_INCIDENTS,
        score: 10,
        createdAt: new Date('2099-01-09T00:00:00.000Z'),
      },
      {
        category: RiskCategory.EXCESSIVE_INCIDENTS,
        score: 10,
        createdAt: new Date('2099-01-08T00:00:00.000Z'),
      },
      {
        category: RiskCategory.CLIENT_REFUND_ABUSE,
        score: 15,
        createdAt: new Date('2099-01-07T00:00:00.000Z'),
      },
    ]);
    prismaMock.riskScoreSnapshot.upsert.mockResolvedValue({
      id: 'snapshot-1',
      actorType: RiskActorType.CLIENT,
      actorId: '11111111-1111-1111-1111-111111111111',
      score: 35,
      level: RiskLevel.MEDIUM,
      updatedAt: now,
    });

    const result = await service.recalculateRiskScore(
      RiskActorType.CLIENT,
      '11111111-1111-1111-1111-111111111111',
      now,
    );

    expect(prismaMock.riskScoreSnapshot.upsert).toHaveBeenCalledWith({
      where: {
        actorType_actorId: {
          actorType: RiskActorType.CLIENT,
          actorId: '11111111-1111-1111-1111-111111111111',
        },
      },
      update: {
        score: 35,
        level: RiskLevel.MEDIUM,
      },
      create: {
        actorType: RiskActorType.CLIENT,
        actorId: '11111111-1111-1111-1111-111111111111',
        score: 35,
        level: RiskLevel.MEDIUM,
      },
    });
    expect(result.breakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: RiskCategory.EXCESSIVE_INCIDENTS,
          contribution: 20,
          eventCount: 2,
        }),
        expect.objectContaining({
          category: RiskCategory.CLIENT_REFUND_ABUSE,
          contribution: 15,
          eventCount: 1,
        }),
      ]),
    );
  });

  it('increases actor risk score when incident spikes accumulate inside the rolling window', async () => {
    const now = new Date('2099-01-10T00:00:00.000Z');
    prismaMock.riskEvent.findMany.mockResolvedValue([
      {
        category: RiskCategory.EXCESSIVE_INCIDENTS,
        score: 10,
        createdAt: new Date('2099-01-09T00:00:00.000Z'),
      },
      {
        category: RiskCategory.EXCESSIVE_INCIDENTS,
        score: 10,
        createdAt: new Date('2099-01-08T00:00:00.000Z'),
      },
      {
        category: RiskCategory.EXCESSIVE_INCIDENTS,
        score: 10,
        createdAt: new Date('2099-01-07T00:00:00.000Z'),
      },
    ]);
    prismaMock.riskScoreSnapshot.upsert.mockResolvedValue({
      id: 'snapshot-incident',
      actorType: RiskActorType.CLIENT,
      actorId: '33333333-3333-3333-3333-333333333333',
      score: 30,
      level: RiskLevel.MEDIUM,
      updatedAt: now,
    });

    const result = await service.recalculateRiskScore(
      RiskActorType.CLIENT,
      '33333333-3333-3333-3333-333333333333',
      now,
    );

    expect(result.snapshot.score).toBe(30);
    expect(result.snapshot.level).toBe(RiskLevel.MEDIUM);
    expect(result.breakdown).toEqual([
      expect.objectContaining({
        category: RiskCategory.EXCESSIVE_INCIDENTS,
        eventCount: 3,
        rawScore: 30,
        contribution: 30,
      }),
    ]);
  });

  it('does not duplicate scoring when the dedupKey already exists', async () => {
    prismaMock.riskEvent.create.mockRejectedValue({ code: 'P2002' });
    prismaMock.riskEvent.findUniqueOrThrow.mockResolvedValue({
      id: 'event-1',
      actorType: RiskActorType.CLIENT,
      actorId: '11111111-1111-1111-1111-111111111111',
      category: RiskCategory.CLIENT_REFUND_ABUSE,
      score: 12,
      metadata: null,
      dedupKey: 'refund-abuse:refund-1',
      createdAt: new Date('2099-01-01T00:00:00.000Z'),
    });

    const result = await service.recordRiskEvent({
      actorType: RiskActorType.CLIENT,
      actorId: '11111111-1111-1111-1111-111111111111',
      category: RiskCategory.CLIENT_REFUND_ABUSE,
      score: 12,
      dedupKey: 'refund-abuse:refund-1',
    });

    expect(result.created).toBe(false);
    expect(prismaMock.riskEvent.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { dedupKey: 'refund-abuse:refund-1' },
    });
  });

  it('sanitizes sensitive metadata before persisting risk events', async () => {
    prismaMock.riskEvent.create.mockImplementation(({ data }: any) => ({
      id: 'event-1',
      createdAt: new Date('2099-01-01T00:00:00.000Z'),
      ...data,
    }));

    await service.recordRiskEvent({
      actorType: RiskActorType.RUNNER,
      actorId: '22222222-2222-2222-2222-222222222222',
      category: RiskCategory.RUNNER_GPS_ANOMALY,
      score: 20,
      metadata: {
        deliveryOrderId: 'delivery-1',
        eventType: 'gps-anomaly',
        token: 'secret-token',
        addressLine: 'Main Street 1',
        latitude: 40.4,
        reason: 'jump-detected',
      },
    });

    expect(prismaMock.riskEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: {
          deliveryOrderId: 'delivery-1',
          eventType: 'gps-anomaly',
          reason: 'jump-detected',
        },
      }),
    });
  });

  it('lists high-risk actors by descending score', async () => {
    prismaMock.riskScoreSnapshot.findMany.mockResolvedValue([
      {
        id: 'snapshot-2',
        actorType: RiskActorType.RUNNER,
        actorId: '22222222-2222-2222-2222-222222222222',
        score: 85,
        level: RiskLevel.CRITICAL,
        updatedAt: new Date('2099-01-02T00:00:00.000Z'),
      },
    ]);

    const result = await service.listHighRiskActors({
      minimumLevel: RiskLevel.HIGH,
      limit: 10,
    });

    expect(prismaMock.riskScoreSnapshot.findMany).toHaveBeenCalledWith({
      where: {
        level: {
          in: [RiskLevel.HIGH, RiskLevel.CRITICAL],
        },
      },
      orderBy: [{ score: 'desc' }, { updatedAt: 'desc' }],
      take: 10,
    });
    expect(result).toHaveLength(1);
    expect(result[0].score).toBe(85);
  });

  it('cleans up risk events older than 90 days', async () => {
    prismaMock.riskEvent.deleteMany.mockResolvedValue({ count: 4 });
    const now = new Date('2099-04-01T00:00:00.000Z');

    const result = await service.cleanupOldRiskEvents(now);

    expect(prismaMock.riskEvent.deleteMany).toHaveBeenCalledWith({
      where: {
        createdAt: {
          lt: new Date('2099-01-01T00:00:00.000Z'),
        },
      },
    });
    expect(result).toEqual({
      deletedCount: 4,
      cutoff: new Date('2099-01-01T00:00:00.000Z'),
    });
  });

  // ─── branch coverage additions ────────────────────────────────────────────

  describe('branch coverage', () => {
    const now = new Date('2099-01-10T00:00:00.000Z');

    it('sanitizeMetadata returns undefined for empty metadata', async () => {
      prismaMock.riskEvent.create.mockImplementation(({ data }: any) => ({
        id: 'event-1',
        createdAt: new Date(),
        ...data,
      }));

      await service.recordRiskEvent({
        actorType: RiskActorType.CLIENT,
        actorId: 'actor-1',
        category: RiskCategory.CLIENT_REFUND_ABUSE,
        score: 10,
        // no metadata
      });

      expect(prismaMock.riskEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ metadata: undefined }),
        }),
      );
    });

    it('sanitizeMetadata returns undefined when all keys are disallowed', async () => {
      prismaMock.riskEvent.create.mockImplementation(({ data }: any) => ({
        id: 'event-1',
        createdAt: new Date(),
        ...data,
      }));

      await service.recordRiskEvent({
        actorType: RiskActorType.CLIENT,
        actorId: 'actor-1',
        category: RiskCategory.CLIENT_REFUND_ABUSE,
        score: 10,
        metadata: {
          email: 'user@example.com',
          addressLine: 'Calle X',
          token: 'secret',
        } as any,
      });

      expect(prismaMock.riskEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ metadata: undefined }),
        }),
      );
    });

    it('recordRiskEvent without dedupKey creates event directly', async () => {
      prismaMock.riskEvent.create.mockImplementation(({ data }: any) => ({
        id: 'event-nodedupkey',
        createdAt: new Date(),
        ...data,
      }));

      const result = await service.recordRiskEvent({
        actorType: RiskActorType.RUNNER,
        actorId: 'runner-1',
        category: RiskCategory.RUNNER_GPS_ANOMALY,
        score: 20,
        // no dedupKey
      });

      expect(result.created).toBe(true);
      expect(prismaMock.riskEvent.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it('recordRiskEvent rethrows non-P2002 errors', async () => {
      prismaMock.riskEvent.create.mockRejectedValue(new Error('DB down'));

      await expect(
        service.recordRiskEvent({
          actorType: RiskActorType.CLIENT,
          actorId: 'actor-1',
          category: RiskCategory.CLIENT_REFUND_ABUSE,
          score: 10,
          dedupKey: 'some-key',
        }),
      ).rejects.toThrow('DB down');
    });

    it('computeRiskLevel returns CRITICAL for score >= threshold', async () => {
      prismaMock.riskEvent.findMany.mockResolvedValue([
        {
          category: RiskCategory.CLIENT_REFUND_ABUSE,
          score: 100,
          createdAt: now,
        },
      ]);
      prismaMock.riskScoreSnapshot.upsert.mockResolvedValue({
        score: 100,
        level: RiskLevel.CRITICAL,
      });

      const result = await service.recalculateRiskScore(
        RiskActorType.CLIENT,
        'actor-crit',
        now,
      );

      expect(result.snapshot.level).toBe(RiskLevel.CRITICAL);
    });

    it('computeRiskLevel returns HIGH for score >= HIGH threshold', async () => {
      // HIGH threshold is typically 70
      prismaMock.riskEvent.findMany.mockResolvedValue([
        {
          category: RiskCategory.EXCESSIVE_INCIDENTS,
          score: 70,
          createdAt: now,
        },
      ]);
      prismaMock.riskScoreSnapshot.upsert.mockResolvedValue({
        score: 70,
        level: RiskLevel.HIGH,
      });

      const result = await service.recalculateRiskScore(
        RiskActorType.CLIENT,
        'actor-high',
        now,
      );

      expect(result.snapshot).toBeDefined();
    });

    it('computeRiskLevel returns LOW for score 0', async () => {
      prismaMock.riskEvent.findMany.mockResolvedValue([]);
      prismaMock.riskScoreSnapshot.upsert.mockResolvedValue({
        score: 0,
        level: RiskLevel.LOW,
      });

      const result = await service.recalculateRiskScore(
        RiskActorType.CLIENT,
        'actor-low',
        now,
      );

      expect(result.snapshot.level).toBe(RiskLevel.LOW);
    });

    it('getActorRiskScore returns snapshot and breakdown', async () => {
      prismaMock.riskScoreSnapshot.findUnique.mockResolvedValue({
        score: 25,
        level: RiskLevel.MEDIUM,
      });
      prismaMock.riskEvent.findMany.mockResolvedValue([
        {
          category: RiskCategory.EXCESSIVE_INCIDENTS,
          score: 25,
          createdAt: now,
        },
      ]);

      const result = await service.getActorRiskScore(
        RiskActorType.CLIENT,
        'actor-1',
        now,
      );

      expect(result.snapshot).toBeDefined();
      expect(result.breakdown).toBeDefined();
    });

    it('getActorRiskScore returns null snapshot when actor has no snapshot', async () => {
      prismaMock.riskScoreSnapshot.findUnique.mockResolvedValue(null);
      prismaMock.riskEvent.findMany.mockResolvedValue([]);

      const result = await service.getActorRiskScore(
        RiskActorType.CLIENT,
        'actor-new',
        now,
      );

      expect(result.snapshot).toBeNull();
      expect(result.breakdown).toEqual([]);
    });

    it('listHighRiskActors uses default HIGH level when minimumLevel not specified', async () => {
      prismaMock.riskScoreSnapshot.findMany.mockResolvedValue([]);

      await service.listHighRiskActors({});

      expect(prismaMock.riskScoreSnapshot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            level: {
              in: expect.arrayContaining([RiskLevel.HIGH, RiskLevel.CRITICAL]),
            },
          },
        }),
      );
    });

    it('listHighRiskActors uses CRITICAL when minimumLevel is CRITICAL', async () => {
      prismaMock.riskScoreSnapshot.findMany.mockResolvedValue([]);

      await service.listHighRiskActors({ minimumLevel: RiskLevel.CRITICAL });

      expect(prismaMock.riskScoreSnapshot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { level: { in: [RiskLevel.CRITICAL] } },
        }),
      );
    });

    it('listActorRiskEvents filters by category and since when provided', async () => {
      prismaMock.riskEvent.findMany.mockResolvedValue([]);
      const since = new Date('2099-01-01T00:00:00.000Z');

      await service.listActorRiskEvents(RiskActorType.CLIENT, 'actor-1', {
        category: RiskCategory.CLIENT_REFUND_ABUSE,
        since,
        limit: 5,
      });

      expect(prismaMock.riskEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            category: RiskCategory.CLIENT_REFUND_ABUSE,
            createdAt: { gte: since },
          }),
        }),
      );
    });

    it('listActorRiskEvents without filters still calls findMany', async () => {
      prismaMock.riskEvent.findMany.mockResolvedValue([]);

      await service.listActorRiskEvents(RiskActorType.RUNNER, 'runner-1');

      expect(prismaMock.riskEvent.findMany).toHaveBeenCalled();
    });

    it('sanitizeMetadataValue handles non-finite numbers → undefined', async () => {
      prismaMock.riskEvent.create.mockImplementation(({ data }: any) => ({
        id: 'event-nan',
        createdAt: new Date(),
        ...data,
      }));

      await service.recordRiskEvent({
        actorType: RiskActorType.CLIENT,
        actorId: 'actor-1',
        category: RiskCategory.CLIENT_REFUND_ABUSE,
        score: 10,
        metadata: {
          eventType: 'test',
          count: Number.NaN, // non-finite number → undefined
        } as any,
      });

      const call = prismaMock.riskEvent.create.mock.calls[0][0];
      const meta = call.data.metadata as Record<string, unknown>;
      // NaN values are filtered out — count key should not appear or be undefined
      expect(meta?.count).toBeUndefined();
    });
  });
});
