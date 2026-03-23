import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  DeliveryJobStatus,
  DeliveryOrderStatus,
  RiskActorType,
  RiskCategory,
  Role,
} from '@prisma/client';
import { DeliveryDispatchService } from './delivery-dispatch.service';
import { DeliveryDomainPolicy } from './delivery-domain-policy';

describe('DeliveryDispatchService', () => {
  let service: DeliveryDispatchService;
  let prismaMock: any;
  let assertClientOrAdminAccess: jest.Mock;
  let resolveActiveRunnerStripePaymentAccount: jest.Mock;
  let logStructuredEvent: jest.Mock;
  let emitRiskEvent: jest.Mock;

  beforeEach(() => {
    prismaMock = {
      $transaction: jest.fn(),
      deliveryJob: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      deliveryJobClaim: {
        count: jest.fn(),
      },
    };
    assertClientOrAdminAccess = jest.fn();
    resolveActiveRunnerStripePaymentAccount = jest
      .fn()
      .mockResolvedValue({ isActive: true });
    logStructuredEvent = jest.fn();
    emitRiskEvent = jest.fn().mockResolvedValue(undefined);

    service = new DeliveryDispatchService(
      prismaMock,
      new DeliveryDomainPolicy(),
      assertClientOrAdminAccess,
      resolveActiveRunnerStripePaymentAccount,
      logStructuredEvent,
      emitRiskEvent,
      () => 5 * 60 * 1000,
      () => 5 * 60 * 1000,
      () => 5,
      (now: Date, windowMs: number) =>
        Math.floor(now.getTime() / windowMs).toString(),
    );
  });

  it('lists only open non-expired jobs and sanitizes the output', async () => {
    prismaMock.deliveryJob.findMany.mockResolvedValue([
      {
        id: 'job-open',
        deliveryOrderId: 'delivery-1',
        expiresAt: new Date('2099-01-01T00:05:00.000Z'),
        deliveryOrder: {
          deliveryFee: 6.5,
          order: {
            city: {
              name: 'Madrid',
            },
          },
        },
        claims: [],
      },
    ]);

    const result = await service.listAvailableJobs('runner-1');

    expect(result).toEqual([
      {
        jobId: 'job-open',
        deliveryOrderId: 'delivery-1',
        pickupArea: 'Madrid',
        deliveryArea: 'Madrid',
        deliveryFee: 6.5,
        expiresAt: new Date('2099-01-01T00:05:00.000Z'),
      },
    ]);
  });

  it('rejects assignment when the runner is not payment-onboarded', async () => {
    resolveActiveRunnerStripePaymentAccount.mockResolvedValue(null);
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        deliveryOrder: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'delivery-1',
            status: DeliveryOrderStatus.PENDING,
            order: {
              id: 'order-1',
              clientId: 'client-1',
            },
          }),
        },
        runnerProfile: {
          findUnique: jest.fn().mockResolvedValue({
            isActive: true,
            user: { active: true, stripeAccountId: null },
          }),
        },
      }),
    );

    await expect(
      service.assignRunner('delivery-1', { runnerId: 'runner-1' }, 'client-1', [
        Role.CLIENT,
      ]),
    ).rejects.toThrow(BadRequestException);
  });

  it('emits job grabbing risk when the runner accepts many jobs in the window', async () => {
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        $executeRaw: jest.fn(),
        deliveryJob: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'job-1',
            deliveryOrderId: 'delivery-1',
            status: DeliveryJobStatus.OPEN,
            expiresAt: new Date('2099-01-01T00:05:00.000Z'),
            deliveryOrder: {
              order: { id: 'order-1' },
            },
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        deliveryJobClaim: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({}),
        },
        runnerProfile: {
          findUnique: jest.fn().mockResolvedValue({
            isActive: true,
            user: { active: true, stripeAccountId: 'acct_runner_1' },
          }),
        },
        deliveryOrder: {
          update: jest.fn().mockResolvedValue({ id: 'delivery-1' }),
        },
        order: {
          update: jest.fn().mockResolvedValue({}),
        },
      }),
    );
    prismaMock.deliveryJobClaim.count.mockResolvedValue(5);

    const result = await service.acceptDeliveryJob('job-1', 'runner-1');

    expect(result).toEqual({
      jobId: 'job-1',
      deliveryOrderId: 'delivery-1',
      runnerId: 'runner-1',
      status: DeliveryJobStatus.ASSIGNED,
    });
    expect(emitRiskEvent).toHaveBeenCalledWith(
      RiskActorType.RUNNER,
      'runner-1',
      RiskCategory.RUNNER_JOB_GRABBING,
      15,
      expect.stringMatching(/^job-grabbing:runner-1:/),
      expect.objectContaining({
        deliveryOrderId: 'delivery-1',
        claimCount: 5,
      }),
    );
  });

  it('marks expired jobs through the worker', async () => {
    prismaMock.deliveryJob.updateMany.mockResolvedValue({ count: 3 });

    const result = await service.expireDeliveryJobs(
      new Date('2099-01-01T00:10:00.000Z'),
    );

    expect(result).toEqual({ expiredJobs: 3 });
  });

  it('rejects accepting an expired job and marks it expired', async () => {
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        $executeRaw: jest.fn(),
        deliveryJob: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'job-expired',
            deliveryOrderId: 'delivery-1',
            status: DeliveryJobStatus.OPEN,
            expiresAt: new Date('2000-01-01T00:00:00.000Z'),
            deliveryOrder: {
              order: { id: 'order-1' },
            },
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        deliveryJobClaim: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      }),
    );

    await expect(
      service.acceptDeliveryJob('job-expired', 'runner-1'),
    ).rejects.toThrow(ConflictException);
  });
});
