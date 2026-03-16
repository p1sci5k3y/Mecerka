import { ExecutionContext } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { RiskActorType, RiskLevel, Role } from '@prisma/client';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MfaCompleteGuard } from '../auth/guards/mfa-complete.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RiskController } from './risk.controller';
import { RiskService } from './risk.service';

describe('RiskController', () => {
  let controller: RiskController;
  let riskServiceMock: jest.Mocked<
    Pick<
      RiskService,
      'getActorRiskScore' | 'listActorRiskEvents' | 'listHighRiskActors'
    >
  >;

  beforeEach(() => {
    riskServiceMock = {
      getActorRiskScore: jest.fn(),
      listActorRiskEvents: jest.fn(),
      listHighRiskActors: jest.fn(),
    };

    controller = new RiskController(riskServiceMock as unknown as RiskService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('protects risk endpoints behind admin-only guards', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, RiskController) ?? [];
    const roles =
      Reflect.getMetadata(ROLES_KEY, RiskController) ??
      Reflect.getMetadata(ROLES_KEY, RiskController.prototype.getActorRisk) ??
      [];

    expect(guards).toEqual([JwtAuthGuard, MfaCompleteGuard, RolesGuard]);
    expect(roles).toEqual([Role.ADMIN]);
  });

  it('denies non-admin access via RolesGuard', () => {
    const guard = new RolesGuard(new Reflector());
    const context = {
      getHandler: () => RiskController.prototype.getActorRisk,
      getClass: () => RiskController,
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            userId: 'client-1',
            roles: [Role.CLIENT],
          },
        }),
      }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(false);
  });

  it('returns actor risk details with recent events', async () => {
    const updatedAt = new Date('2099-01-01T00:00:00.000Z');
    riskServiceMock.getActorRiskScore.mockResolvedValue({
      snapshot: {
        id: 'snapshot-1',
        actorType: RiskActorType.CLIENT,
        actorId: '11111111-1111-1111-1111-111111111111',
        score: 24,
        level: RiskLevel.MEDIUM,
        updatedAt,
      } as any,
      breakdown: [],
    });
    riskServiceMock.listActorRiskEvents.mockResolvedValue([
      {
        id: 'event-1',
        actorType: RiskActorType.CLIENT,
        actorId: '11111111-1111-1111-1111-111111111111',
        category: 'CLIENT_REFUND_ABUSE',
        score: 12,
        createdAt: updatedAt,
        metadata: { refundRequestId: 'refund-1' },
      } as any,
    ]);

    const result = await controller.getActorRisk(
      RiskActorType.CLIENT,
      '11111111-1111-1111-1111-111111111111',
    );

    expect(result).toEqual({
      actorId: '11111111-1111-1111-1111-111111111111',
      actorType: RiskActorType.CLIENT,
      score: 24,
      level: RiskLevel.MEDIUM,
      updatedAt,
      recentEvents: [
        expect.objectContaining({
          id: 'event-1',
          score: 12,
        }),
      ],
      breakdown: [],
    });
  });

  it('lists high-risk actors with recent events', async () => {
    riskServiceMock.listHighRiskActors.mockResolvedValue([
      {
        id: 'snapshot-2',
        actorType: RiskActorType.RUNNER,
        actorId: '22222222-2222-2222-2222-222222222222',
        score: 85,
        level: RiskLevel.CRITICAL,
        updatedAt: new Date('2099-01-02T00:00:00.000Z'),
      } as any,
    ]);
    riskServiceMock.getActorRiskScore.mockResolvedValue({
      snapshot: {
        id: 'snapshot-2',
        actorType: RiskActorType.RUNNER,
        actorId: '22222222-2222-2222-2222-222222222222',
        score: 85,
        level: RiskLevel.CRITICAL,
        updatedAt: new Date('2099-01-02T00:00:00.000Z'),
      } as any,
      breakdown: [],
    });
    riskServiceMock.listActorRiskEvents.mockResolvedValue([
      {
        id: 'event-2',
        actorType: RiskActorType.RUNNER,
        actorId: '22222222-2222-2222-2222-222222222222',
        category: 'RUNNER_GPS_ANOMALY',
        score: 20,
        createdAt: new Date('2099-01-02T00:00:00.000Z'),
        metadata: { deliveryOrderId: 'delivery-1' },
      } as any,
    ]);

    const result = await controller.listHighRiskActors();

    expect(result).toEqual([
      expect.objectContaining({
        actorId: '22222222-2222-2222-2222-222222222222',
        actorType: RiskActorType.RUNNER,
        score: 85,
        level: RiskLevel.CRITICAL,
        recentEvents: [expect.objectContaining({ id: 'event-2' })],
      }),
    ]);
  });
});
