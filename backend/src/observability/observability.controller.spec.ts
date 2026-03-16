import { BadRequestException, ExecutionContext } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MfaCompleteGuard } from '../auth/guards/mfa-complete.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ObservabilityController } from './observability.controller';
import { ObservabilityService } from './observability.service';

describe('ObservabilityController', () => {
  let controller: ObservabilityController;
  let observabilityServiceMock: jest.Mocked<
    Pick<
      ObservabilityService,
      'getMetrics' | 'getSlaMetrics' | 'getReconciliation'
    >
  >;

  beforeEach(() => {
    observabilityServiceMock = {
      getMetrics: jest.fn(),
      getSlaMetrics: jest.fn(),
      getReconciliation: jest.fn(),
    };

    controller = new ObservabilityController(
      observabilityServiceMock as unknown as ObservabilityService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('protects observability endpoints behind admin-only guards', () => {
    const guards =
      Reflect.getMetadata(GUARDS_METADATA, ObservabilityController) ?? [];
    const roles =
      Reflect.getMetadata(ROLES_KEY, ObservabilityController) ??
      Reflect.getMetadata(
        ROLES_KEY,
        ObservabilityController.prototype.getMetrics,
      ) ??
      [];

    expect(guards).toEqual([JwtAuthGuard, MfaCompleteGuard, RolesGuard]);
    expect(roles).toEqual([Role.ADMIN]);
  });

  it('denies non-admin access via RolesGuard', () => {
    const guard = new RolesGuard(new Reflector());
    const context = {
      getHandler: () => ObservabilityController.prototype.getMetrics,
      getClass: () => ObservabilityController,
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

  it('uses the default 24h window for metrics when omitted', async () => {
    observabilityServiceMock.getMetrics.mockResolvedValue({
      window: '24h',
    } as any);

    await controller.getMetrics();

    expect(observabilityServiceMock.getMetrics).toHaveBeenCalledWith('24h');
  });

  it('passes through valid windows for SLA and reconciliation', async () => {
    observabilityServiceMock.getSlaMetrics.mockResolvedValue({} as any);
    observabilityServiceMock.getReconciliation.mockResolvedValue({} as any);

    await controller.getSlaMetrics('7d');
    await controller.getReconciliation('30d');

    expect(observabilityServiceMock.getSlaMetrics).toHaveBeenCalledWith('7d');
    expect(observabilityServiceMock.getReconciliation).toHaveBeenCalledWith(
      '30d',
    );
  });

  it('rejects invalid window values with a controlled bad request', async () => {
    expect(() => controller.getMetrics('90d')).toThrow(BadRequestException);
    expect(() => controller.getMetrics('90d')).toThrow(
      'Invalid window. Expected one of: 24h, 7d, 30d',
    );
  });
});
