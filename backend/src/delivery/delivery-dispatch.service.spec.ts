import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
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

  it('lists open jobs without claim filtering when runnerId is omitted', async () => {
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
      },
    ]);

    const result = await service.listAvailableJobs();

    expect(result).toHaveLength(1);
    expect(prismaMock.deliveryJob.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          claims: false,
        }),
      }),
    );
  });

  it('filters out jobs already claimed by the current runner', async () => {
    prismaMock.deliveryJob.findMany.mockResolvedValue([
      {
        id: 'job-claimed',
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
        claims: [{ id: 'claim-1' }],
      },
    ]);

    const result = await service.listAvailableJobs('runner-1');

    expect(result).toEqual([]);
  });

  it('returns the existing job when createDeliveryJob is retried', async () => {
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        deliveryOrder: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'delivery-1',
            job: { id: 'job-existing' },
          }),
        },
      }),
    );

    const result = await service.createDeliveryJob('delivery-1');

    expect(result).toEqual({ id: 'job-existing' });
  });

  it('rejects createDeliveryJob when the delivery order does not exist', async () => {
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        deliveryOrder: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      }),
    );

    await expect(service.createDeliveryJob('delivery-404')).rejects.toThrow(
      new NotFoundException('DeliveryOrder not found'),
    );
  });

  it('creates an initial dispatch job record with the configured expiry window', async () => {
    const txMock = {
      deliveryJob: {
        create: jest.fn().mockResolvedValue({ id: 'job-created' }),
      },
    };

    const result = await service.createInitialDeliveryJob(
      txMock as never,
      'delivery-1',
    );

    expect(txMock.deliveryJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        deliveryOrderId: 'delivery-1',
        status: DeliveryJobStatus.OPEN,
        expiresAt: expect.any(Date),
      }),
    });
    expect(result).toEqual({ id: 'job-created' });
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

  it('rejects assignment when the delivery order does not exist', async () => {
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        deliveryOrder: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      }),
    );

    await expect(
      service.assignRunner(
        'delivery-404',
        { runnerId: 'runner-1' },
        'client-1',
        [Role.CLIENT],
      ),
    ).rejects.toThrow(new NotFoundException('DeliveryOrder not found'));
  });

  it('rejects assignment when the delivery order is not assignable', async () => {
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        deliveryOrder: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'delivery-1',
            status: DeliveryOrderStatus.DELIVERED,
            order: {
              id: 'order-1',
              clientId: 'client-1',
            },
          }),
        },
      }),
    );

    await expect(
      service.assignRunner('delivery-1', { runnerId: 'runner-1' }, 'client-1', [
        Role.CLIENT,
      ]),
    ).rejects.toThrow(new ConflictException('DeliveryOrder is not assignable'));
  });

  it('rejects assignment when the runner profile does not exist', async () => {
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
          findUnique: jest.fn().mockResolvedValue(null),
        },
      }),
    );

    await expect(
      service.assignRunner(
        'delivery-1',
        { runnerId: 'runner-404' },
        'client-1',
        [Role.CLIENT],
      ),
    ).rejects.toThrow(new NotFoundException('Runner not found'));
  });

  it('rejects assignment when the runner or linked user is inactive', async () => {
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
            isActive: false,
            user: { active: true, stripeAccountId: 'acct_runner_1' },
          }),
        },
      }),
    );

    await expect(
      service.assignRunner('delivery-1', { runnerId: 'runner-1' }, 'client-1', [
        Role.CLIENT,
      ]),
    ).rejects.toThrow(new BadRequestException('Runner is not active'));
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
