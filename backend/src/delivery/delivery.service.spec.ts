import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  DeliveryOrderStatus,
  DeliveryJobStatus,
  PaymentSessionStatus,
  Role,
  RunnerPaymentStatus,
} from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import {
  DeliveryIncidentStatusValues,
  DeliveryIncidentTypeValues,
  IncidentReporterRoleValues,
} from './delivery-incident.constants';
import { DeliveryService } from './delivery.service';

jest.mock('stripe');

describe('DeliveryService', () => {
  let service: DeliveryService;
  let prismaMock: any;
  let stripePaymentIntentsCreate: jest.Mock;
  let stripePaymentIntentsRetrieve: jest.Mock;
  const assignedRunner = {
    userId: 'runner-1',
    isActive: true,
    user: {
      active: true,
    },
  };

  beforeEach(async () => {
    stripePaymentIntentsCreate = jest.fn().mockResolvedValue({
      id: 'pi_runner_123',
      client_secret: 'pi_runner_123_secret',
      livemode: false,
    });
    stripePaymentIntentsRetrieve = jest.fn().mockResolvedValue({
      id: 'pi_runner_existing',
      client_secret: 'pi_runner_existing_secret',
    });

    (Stripe as unknown as jest.Mock).mockImplementation(() => ({
      paymentIntents: {
        create: stripePaymentIntentsCreate,
        retrieve: stripePaymentIntentsRetrieve,
      },
    }));

    prismaMock = {
      order: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      deliveryOrder: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      deliveryJob: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      deliveryJobClaim: {
        create: jest.fn(),
        findUnique: jest.fn(),
      },
      runnerProfile: {
        findUnique: jest.fn(),
      },
      paymentAccount: {
        findFirst: jest.fn(),
        upsert: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      runnerLocation: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      deliveryIncident: {
        count: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      runnerPaymentSession: {
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findUnique: jest.fn(),
      },
      runnerWebhookEvent: {
        create: jest.fn(),
        update: jest.fn(),
      },
      providerOrder: {
        findUnique: jest.fn(),
      },
      stockReservation: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeliveryService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'STRIPE_SECRET_KEY') return 'sk_test_dummy';
              if (key === 'DELIVERY_STRIPE_WEBHOOK_SECRET')
                return 'whsec_runner';
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<DeliveryService>(DeliveryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('creates a DeliveryOrder without touching provider payments', async () => {
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        $executeRaw: jest.fn(),
        order: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'order-1',
            clientId: 'client-1',
            deliveryOrder: null,
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        deliveryOrder: {
          create: jest.fn().mockResolvedValue({
            id: 'delivery-1',
            orderId: 'order-1',
            deliveryFee: 6.5,
            currency: 'EUR',
            status: DeliveryOrderStatus.PENDING,
            paymentStatus: RunnerPaymentStatus.PENDING,
            order: { clientId: 'client-1' },
          }),
        },
        deliveryJob: {
          create: jest.fn().mockResolvedValue({
            id: 'job-1',
            deliveryOrderId: 'delivery-1',
            status: DeliveryJobStatus.OPEN,
            expiresAt: new Date('2099-01-01T00:05:00.000Z'),
          }),
        },
      }),
    );

    const result = await service.createDeliveryOrder(
      { orderId: 'order-1', deliveryFee: 6.5, currency: 'EUR' },
      'client-1',
      [Role.CLIENT],
    );

    expect(result).toEqual(
      expect.objectContaining({
        id: 'delivery-1',
        status: DeliveryOrderStatus.PENDING,
        paymentStatus: RunnerPaymentStatus.PENDING,
      }),
    );
    expect(prismaMock.providerOrder.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.stockReservation.findMany).not.toHaveBeenCalled();
  });

  it('creates a delivery job when the DeliveryOrder is created', async () => {
    const txDeliveryJobCreate = jest.fn().mockResolvedValue({
      id: 'job-1',
      deliveryOrderId: 'delivery-1',
      status: DeliveryJobStatus.OPEN,
      expiresAt: new Date('2099-01-01T00:05:00.000Z'),
    });

    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        $executeRaw: jest.fn(),
        order: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'order-1',
            clientId: 'client-1',
            deliveryOrder: null,
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        deliveryOrder: {
          create: jest.fn().mockResolvedValue({
            id: 'delivery-1',
            orderId: 'order-1',
            deliveryFee: 6.5,
            currency: 'EUR',
            status: DeliveryOrderStatus.PENDING,
            paymentStatus: RunnerPaymentStatus.PENDING,
            order: { clientId: 'client-1' },
          }),
        },
        deliveryJob: {
          create: txDeliveryJobCreate,
        },
      }),
    );

    await service.createDeliveryOrder(
      { orderId: 'order-1', deliveryFee: 6.5, currency: 'EUR' },
      'client-1',
      [Role.CLIENT],
    );

    expect(txDeliveryJobCreate).toHaveBeenCalledWith({
      data: {
        deliveryOrderId: 'delivery-1',
        status: DeliveryJobStatus.OPEN,
        expiresAt: expect.any(Date),
      },
    });
  });

  it('assigns a runner with an active payment account', async () => {
    prismaMock.paymentAccount.findFirst.mockResolvedValue({
      id: 'payacc-1',
      isActive: true,
      externalAccountId: 'acct_runner_1',
    });

    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        deliveryOrder: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'delivery-1',
            runnerId: null,
            status: DeliveryOrderStatus.PENDING,
            order: { id: 'order-1', clientId: 'client-1' },
          }),
          update: jest.fn().mockResolvedValue({
            id: 'delivery-1',
            runnerId: 'runner-1',
            status: DeliveryOrderStatus.RUNNER_ASSIGNED,
            order: { clientId: 'client-1' },
          }),
        },
        runnerProfile: {
          findUnique: jest.fn().mockResolvedValue({
            userId: 'runner-1',
            isActive: true,
            user: {
              id: 'runner-1',
              active: true,
              stripeAccountId: 'acct_runner_1',
            },
          }),
        },
        order: {
          update: jest.fn().mockResolvedValue({}),
        },
      }),
    );

    const result = await service.assignRunner(
      'delivery-1',
      { runnerId: 'runner-1' },
      'client-1',
      [Role.CLIENT],
    );

    expect(result.runnerId).toBe('runner-1');
    expect(result.status).toBe(DeliveryOrderStatus.RUNNER_ASSIGNED);
  });

  it('creates a retry-safe runner payment session', async () => {
    prismaMock.paymentAccount.findFirst.mockResolvedValue({
      id: 'payacc-1',
      isActive: true,
      externalAccountId: 'acct_runner_1',
    });

    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        $executeRaw: jest.fn(),
        deliveryOrder: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'delivery-1',
            runnerId: 'runner-1',
            deliveryFee: 6.5,
            currency: 'EUR',
            status: DeliveryOrderStatus.RUNNER_ASSIGNED,
            paymentStatus: RunnerPaymentStatus.PENDING,
            order: { id: 'order-1', clientId: 'client-1' },
            paymentSessions: [],
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        runnerPaymentSession: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          create: jest.fn().mockResolvedValue({
            id: 'runner-session-1',
          }),
        },
      }),
    );

    const result = await service.prepareRunnerPayment(
      'delivery-1',
      'client-1',
      [Role.CLIENT],
    );

    expect(stripePaymentIntentsCreate).toHaveBeenCalledWith(
      {
        amount: 650,
        currency: 'eur',
        automatic_payment_methods: { enabled: true },
        metadata: {
          orderId: 'order-1',
          deliveryOrderId: 'delivery-1',
          runnerId: 'runner-1',
        },
      },
      {
        stripeAccount: 'acct_runner_1',
      },
    );
    expect(result).toEqual(
      expect.objectContaining({
        deliveryOrderId: 'delivery-1',
        externalSessionId: 'pi_runner_123',
        paymentStatus: RunnerPaymentStatus.PAYMENT_READY,
      }),
    );
  });

  it('confirms runner payment without touching provider orders or stock reservations', async () => {
    prismaMock.runnerWebhookEvent.create.mockResolvedValue({
      id: 'evt_runner_1',
    });
    prismaMock.runnerWebhookEvent.update.mockResolvedValue({});

    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        runnerPaymentSession: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'runner-session-1',
            deliveryOrderId: 'delivery-1',
            status: PaymentSessionStatus.READY,
            deliveryOrder: {
              id: 'delivery-1',
              status: DeliveryOrderStatus.RUNNER_ASSIGNED,
              paymentStatus: RunnerPaymentStatus.PENDING,
            },
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        deliveryOrder: {
          update: jest.fn().mockResolvedValue({}),
        },
      }),
    );

    const result = await service.confirmRunnerPayment(
      'pi_runner_123',
      'evt_runner_1',
    );

    expect(prismaMock.providerOrder.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.stockReservation.findMany).not.toHaveBeenCalled();
    expect(result).toEqual({
      deliveryOrderId: 'delivery-1',
      status: DeliveryOrderStatus.PICKUP_PENDING,
      paymentStatus: RunnerPaymentStatus.PAID,
    });
  });

  it('enforces ownership on delivery reads', async () => {
    prismaMock.deliveryOrder.findUnique.mockResolvedValue({
      id: 'delivery-1',
      runnerId: 'runner-1',
      order: { clientId: 'client-1' },
      paymentSessions: [],
    });

    await expect(
      service.getDeliveryOrder('delivery-1', 'client-2', [Role.CLIENT]),
    ).rejects.toThrow(ForbiddenException);
  });

  it('lists only open, non-expired jobs with minimal data', async () => {
    prismaMock.deliveryJob.findMany.mockResolvedValue([
      {
        id: 'job-open',
        deliveryOrderId: 'delivery-1',
        status: DeliveryJobStatus.OPEN,
        expiresAt: new Date('2099-01-01T00:05:00.000Z'),
        claims: [],
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

  it('accepts a delivery job and assigns exactly one runner', async () => {
    prismaMock.paymentAccount.findFirst.mockResolvedValue({
      id: 'payacc-1',
      isActive: true,
      externalAccountId: 'acct_runner_1',
    });

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
              id: 'delivery-1',
              order: {
                id: 'order-1',
              },
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
            userId: 'runner-1',
            isActive: true,
            user: {
              id: 'runner-1',
              active: true,
              stripeAccountId: 'acct_runner_1',
            },
          }),
        },
        deliveryOrder: {
          update: jest.fn().mockResolvedValue({
            id: 'delivery-1',
          }),
        },
        order: {
          update: jest.fn().mockResolvedValue({}),
        },
      }),
    );

    const result = await service.acceptDeliveryJob('job-1', 'runner-1');

    expect(result).toEqual({
      jobId: 'job-1',
      deliveryOrderId: 'delivery-1',
      runnerId: 'runner-1',
      status: DeliveryJobStatus.ASSIGNED,
    });
  });

  it('prevents the same runner from accepting the same job twice', async () => {
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
              id: 'delivery-1',
              order: {
                id: 'order-1',
              },
            },
          }),
        },
        deliveryJobClaim: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'claim-1',
            jobId: 'job-1',
            runnerId: 'runner-1',
          }),
        },
      }),
    );

    await expect(
      service.acceptDeliveryJob('job-1', 'runner-1'),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects expired jobs and marks them expired', async () => {
    const txJobUpdate = jest.fn().mockResolvedValue({});

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
              id: 'delivery-1',
              order: {
                id: 'order-1',
              },
            },
          }),
          update: txJobUpdate,
        },
        deliveryJobClaim: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      }),
    );

    await expect(
      service.acceptDeliveryJob('job-expired', 'runner-1'),
    ).rejects.toThrow('Delivery job has expired');
    expect(txJobUpdate).toHaveBeenCalledWith({
      where: { id: 'job-expired' },
      data: {
        status: DeliveryJobStatus.EXPIRED,
      },
    });
  });

  it('expires open jobs through the worker', async () => {
    prismaMock.deliveryJob.updateMany.mockResolvedValue({ count: 2 });

    const result = await service.expireDeliveryJobs(
      new Date('2099-01-01T00:10:00.000Z'),
    );

    expect(prismaMock.deliveryJob.updateMany).toHaveBeenCalledWith({
      where: {
        status: DeliveryJobStatus.OPEN,
        expiresAt: {
          lt: new Date('2099-01-01T00:10:00.000Z'),
        },
      },
      data: {
        status: DeliveryJobStatus.EXPIRED,
      },
    });
    expect(result).toEqual({ expiredJobs: 2 });
  });

  it('sequential concurrent acceptance yields a single winner', async () => {
    prismaMock.paymentAccount.findFirst.mockResolvedValue({
      id: 'payacc-1',
      isActive: true,
      externalAccountId: 'acct_runner_1',
    });

    let jobStatus: DeliveryJobStatus = DeliveryJobStatus.OPEN;

    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        $executeRaw: jest.fn(),
        deliveryJob: {
          findUnique: jest.fn().mockImplementation(() =>
            Promise.resolve({
              id: 'job-1',
              deliveryOrderId: 'delivery-1',
              status: jobStatus,
              expiresAt: new Date('2099-01-01T00:05:00.000Z'),
              deliveryOrder: {
                id: 'delivery-1',
                order: {
                  id: 'order-1',
                },
              },
            }),
          ),
          update: jest.fn().mockImplementation(() => {
            jobStatus = DeliveryJobStatus.ASSIGNED;
            return Promise.resolve({});
          }),
        },
        deliveryJobClaim: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({}),
        },
        runnerProfile: {
          findUnique: jest.fn().mockResolvedValue({
            userId: 'runner-1',
            isActive: true,
            user: {
              id: 'runner-1',
              active: true,
              stripeAccountId: 'acct_runner_1',
            },
          }),
        },
        deliveryOrder: {
          update: jest.fn().mockResolvedValue({
            id: 'delivery-1',
          }),
        },
        order: {
          update: jest.fn().mockResolvedValue({}),
        },
      }),
    );

    const first = await service.acceptDeliveryJob('job-1', 'runner-1');
    await expect(
      service.acceptDeliveryJob('job-1', 'runner-2'),
    ).rejects.toThrow('Delivery job is no longer available');

    expect(first.status).toBe(DeliveryJobStatus.ASSIGNED);
  });

  it('rejects lifecycle changes from a runner who is not assigned', async () => {
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        $executeRaw: jest.fn(),
        deliveryOrder: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'delivery-1',
            runnerId: 'runner-assigned',
            status: DeliveryOrderStatus.RUNNER_ASSIGNED,
            pickupAt: null,
            transitAt: null,
            deliveredAt: null,
          }),
        },
      }),
    );

    await expect(
      service.markPickupPending('delivery-1', 'runner-other', [Role.RUNNER]),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects invalid lifecycle transitions', async () => {
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        $executeRaw: jest.fn(),
        deliveryOrder: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'delivery-1',
            runnerId: 'runner-1',
            status: DeliveryOrderStatus.RUNNER_ASSIGNED,
            pickupAt: null,
            transitAt: null,
            deliveredAt: null,
          }),
        },
        runnerProfile: {
          findUnique: jest.fn().mockResolvedValue(assignedRunner),
        },
      }),
    );

    await expect(
      service.startTransit('delivery-1', 'runner-1', [Role.RUNNER]),
    ).rejects.toThrow(
      'Invalid delivery lifecycle transition from RUNNER_ASSIGNED to IN_TRANSIT',
    );
  });

  it('moves to pickup pending correctly', async () => {
    const txUpdate = jest.fn().mockResolvedValue({
      id: 'delivery-1',
      runnerId: 'runner-1',
      status: DeliveryOrderStatus.PICKUP_PENDING,
    });

    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        $executeRaw: jest.fn(),
        deliveryOrder: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'delivery-1',
            runnerId: 'runner-1',
            status: DeliveryOrderStatus.RUNNER_ASSIGNED,
            pickupAt: null,
            transitAt: null,
            deliveredAt: null,
          }),
          update: txUpdate,
        },
        runnerProfile: {
          findUnique: jest.fn().mockResolvedValue(assignedRunner),
        },
      }),
    );

    const result = await service.markPickupPending('delivery-1', 'runner-1', [
      Role.RUNNER,
    ]);

    expect(txUpdate).toHaveBeenCalledWith({
      where: { id: 'delivery-1' },
      data: {
        status: DeliveryOrderStatus.PICKUP_PENDING,
      },
    });
    expect(result.status).toBe(DeliveryOrderStatus.PICKUP_PENDING);
  });

  it('confirms pickup and sets pickupAt once', async () => {
    const firstPickupAt = new Date('2099-01-01T00:00:00.000Z');
    const txUpdate = jest.fn().mockResolvedValue({
      id: 'delivery-1',
      runnerId: 'runner-1',
      status: DeliveryOrderStatus.PICKED_UP,
      pickupAt: firstPickupAt,
    });

    prismaMock.$transaction.mockImplementationOnce(async (callback: any) =>
      callback({
        $executeRaw: jest.fn(),
        deliveryOrder: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'delivery-1',
            runnerId: 'runner-1',
            status: DeliveryOrderStatus.PICKUP_PENDING,
            pickupAt: null,
            transitAt: null,
            deliveredAt: null,
          }),
          update: txUpdate,
        },
        runnerProfile: {
          findUnique: jest.fn().mockResolvedValue(assignedRunner),
        },
      }),
    );

    const first = await service.confirmPickup('delivery-1', 'runner-1', [
      Role.RUNNER,
    ]);
    expect(first.status).toBe(DeliveryOrderStatus.PICKED_UP);
    expect(txUpdate.mock.calls[0][0].data).toEqual({
      status: DeliveryOrderStatus.PICKED_UP,
      pickupAt: expect.any(Date),
    });

    prismaMock.$transaction.mockImplementationOnce(async (callback: any) =>
      callback({
        $executeRaw: jest.fn(),
        deliveryOrder: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'delivery-1',
            runnerId: 'runner-1',
            status: DeliveryOrderStatus.PICKED_UP,
            pickupAt: firstPickupAt,
            transitAt: null,
            deliveredAt: null,
          }),
        },
        runnerProfile: {
          findUnique: jest.fn().mockResolvedValue(assignedRunner),
        },
      }),
    );

    const second = await service.confirmPickup('delivery-1', 'runner-1', [
      Role.RUNNER,
    ]);
    expect(second.pickupAt).toEqual(firstPickupAt);
  });

  it('starts transit and sets transitAt', async () => {
    const txUpdate = jest.fn().mockResolvedValue({
      id: 'delivery-1',
      status: DeliveryOrderStatus.IN_TRANSIT,
      transitAt: new Date('2099-01-01T00:05:00.000Z'),
    });

    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        $executeRaw: jest.fn(),
        deliveryOrder: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'delivery-1',
            runnerId: 'runner-1',
            status: DeliveryOrderStatus.PICKED_UP,
            pickupAt: new Date('2099-01-01T00:00:00.000Z'),
            transitAt: null,
            deliveredAt: null,
          }),
          update: txUpdate,
        },
        runnerProfile: {
          findUnique: jest.fn().mockResolvedValue(assignedRunner),
        },
      }),
    );

    const result = await service.startTransit('delivery-1', 'runner-1', [
      Role.RUNNER,
    ]);
    expect(result.status).toBe(DeliveryOrderStatus.IN_TRANSIT);
    expect(txUpdate.mock.calls[0][0].data).toEqual({
      status: DeliveryOrderStatus.IN_TRANSIT,
      transitAt: expect.any(Date),
    });
  });

  it('confirms delivery and stores proof fields', async () => {
    const txUpdate = jest.fn().mockResolvedValue({
      id: 'delivery-1',
      status: DeliveryOrderStatus.DELIVERED,
      deliveredAt: new Date('2099-01-01T00:10:00.000Z'),
      deliveryProofUrl: 'https://cdn.example.com/proof.jpg',
      deliveryNotes: 'Handed to customer',
    });

    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        $executeRaw: jest.fn(),
        deliveryOrder: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'delivery-1',
            runnerId: 'runner-1',
            status: DeliveryOrderStatus.IN_TRANSIT,
            pickupAt: new Date('2099-01-01T00:00:00.000Z'),
            transitAt: new Date('2099-01-01T00:05:00.000Z'),
            deliveredAt: null,
          }),
          update: txUpdate,
        },
        runnerProfile: {
          findUnique: jest.fn().mockResolvedValue(assignedRunner),
        },
      }),
    );

    const result = await service.confirmDelivery(
      'delivery-1',
      'runner-1',
      [Role.RUNNER],
      {
        deliveryProofUrl: 'https://cdn.example.com/proof.jpg',
        deliveryNotes: 'Handed to customer',
      },
    );

    expect(result.status).toBe(DeliveryOrderStatus.DELIVERED);
    expect(txUpdate.mock.calls[0][0].data).toEqual({
      status: DeliveryOrderStatus.DELIVERED,
      deliveredAt: expect.any(Date),
      deliveryProofUrl: 'https://cdn.example.com/proof.jpg',
      deliveryNotes: 'Handed to customer',
    });
  });

  it('does not overwrite deliveredAt on repeated delivery confirmation', async () => {
    const deliveredAt = new Date('2099-01-01T00:10:00.000Z');

    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        $executeRaw: jest.fn(),
        deliveryOrder: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'delivery-1',
            runnerId: 'runner-1',
            status: DeliveryOrderStatus.DELIVERED,
            pickupAt: new Date('2099-01-01T00:00:00.000Z'),
            transitAt: new Date('2099-01-01T00:05:00.000Z'),
            deliveredAt,
            deliveryProofUrl: 'https://cdn.example.com/proof.jpg',
            deliveryNotes: 'done',
          }),
        },
        runnerProfile: {
          findUnique: jest.fn().mockResolvedValue(assignedRunner),
        },
      }),
    );

    const result = await service.confirmDelivery(
      'delivery-1',
      'runner-1',
      [Role.RUNNER],
      {
        deliveryProofUrl: 'https://cdn.example.com/other.jpg',
        deliveryNotes: 'retry',
      },
    );

    expect(result.deliveredAt).toEqual(deliveredAt);
    expect(result.deliveryProofUrl).toBe('https://cdn.example.com/proof.jpg');
  });

  it('rejects lifecycle transitions after cancellation', async () => {
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        $executeRaw: jest.fn(),
        deliveryOrder: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'delivery-1',
            runnerId: 'runner-1',
            status: DeliveryOrderStatus.CANCELLED,
            pickupAt: null,
            transitAt: null,
            deliveredAt: null,
          }),
        },
        runnerProfile: {
          findUnique: jest.fn().mockResolvedValue(assignedRunner),
        },
      }),
    );

    await expect(
      service.markPickupPending('delivery-1', 'runner-1', [Role.RUNNER]),
    ).rejects.toThrow(
      'Invalid delivery lifecycle transition from CANCELLED to PICKUP_PENDING',
    );
  });

  it('sequential concurrent lifecycle updates allow only the first valid transition', async () => {
    let currentStatus: DeliveryOrderStatus = DeliveryOrderStatus.PICKUP_PENDING;

    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        $executeRaw: jest.fn(),
        deliveryOrder: {
          findUnique: jest.fn().mockImplementation(() =>
            Promise.resolve({
              id: 'delivery-1',
              runnerId: 'runner-1',
              status: currentStatus,
              pickupAt: null,
              transitAt: null,
              deliveredAt: null,
            }),
          ),
          update: jest.fn().mockImplementation(() => {
            currentStatus = DeliveryOrderStatus.PICKED_UP;
            return Promise.resolve({
              id: 'delivery-1',
              runnerId: 'runner-1',
              status: DeliveryOrderStatus.PICKED_UP,
              pickupAt: new Date('2099-01-01T00:00:00.000Z'),
            });
          }),
        },
        runnerProfile: {
          findUnique: jest.fn().mockResolvedValue(assignedRunner),
        },
      }),
    );

    const first = await service.confirmPickup('delivery-1', 'runner-1', [
      Role.RUNNER,
    ]);
    expect(first.status).toBe(DeliveryOrderStatus.PICKED_UP);

    await expect(
      service.markPickupPending('delivery-1', 'runner-1', [Role.RUNNER]),
    ).rejects.toThrow(
      'Invalid delivery lifecycle transition from PICKED_UP to PICKUP_PENDING',
    );
  });

  it('rejects location updates before pickup flow is active', async () => {
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        $executeRaw: jest.fn(),
        deliveryOrder: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'delivery-1',
            runnerId: 'runner-1',
            status: DeliveryOrderStatus.RUNNER_ASSIGNED,
            lastLocationUpdateAt: null,
          }),
        },
        runnerProfile: {
          findUnique: jest.fn().mockResolvedValue(assignedRunner),
        },
      }),
    );

    await expect(
      service.updateRunnerLocation('delivery-1', 'runner-1', [Role.RUNNER], {
        latitude: 40.4168,
        longitude: -3.7038,
      }),
    ).rejects.toThrow(
      'Runner location updates are not allowed for the current delivery status',
    );
  });

  it('rejects location updates after delivery', async () => {
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        $executeRaw: jest.fn(),
        deliveryOrder: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'delivery-1',
            runnerId: 'runner-1',
            status: DeliveryOrderStatus.DELIVERED,
            lastLocationUpdateAt: null,
          }),
        },
        runnerProfile: {
          findUnique: jest.fn().mockResolvedValue(assignedRunner),
        },
      }),
    );

    await expect(
      service.updateRunnerLocation('delivery-1', 'runner-1', [Role.RUNNER], {
        latitude: 40.4168,
        longitude: -3.7038,
      }),
    ).rejects.toThrow(
      'Runner location updates are not allowed for the current delivery status',
    );
  });

  it('rate limits excessive location updates', async () => {
    prismaMock.runnerLocation.findFirst.mockResolvedValue(null);

    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        $executeRaw: jest.fn(),
        deliveryOrder: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'delivery-1',
            runnerId: 'runner-1',
            status: DeliveryOrderStatus.IN_TRANSIT,
            lastLocationUpdateAt: new Date(),
          }),
        },
        runnerProfile: {
          findUnique: jest.fn().mockResolvedValue(assignedRunner),
        },
        runnerLocation: {
          findFirst: prismaMock.runnerLocation.findFirst,
        },
      }),
    );

    await expect(
      service.updateRunnerLocation('delivery-1', 'runner-1', [Role.RUNNER], {
        latitude: 40.4168,
        longitude: -3.7038,
      }),
    ).rejects.toThrow('Runner location updates are too frequent');
  });

  it('persists location and updates the current delivery position on active delivery', async () => {
    const previousUpdateAt = new Date(Date.now() - 5000);
    const persistedUpdateAt = new Date(Date.now());
    const txLocationCreate = jest.fn().mockResolvedValue({});
    const txDeliveryUpdate = jest.fn().mockResolvedValue({
      id: 'delivery-1',
      lastLocationUpdateAt: persistedUpdateAt,
    });

    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        $executeRaw: jest.fn(),
        deliveryOrder: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'delivery-1',
            runnerId: 'runner-1',
            status: DeliveryOrderStatus.IN_TRANSIT,
            lastLocationUpdateAt: previousUpdateAt,
          }),
          update: txDeliveryUpdate,
        },
        runnerProfile: {
          findUnique: jest.fn().mockResolvedValue(assignedRunner),
        },
        runnerLocation: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: txLocationCreate,
        },
      }),
    );

    const result = await service.updateRunnerLocation(
      'delivery-1',
      'runner-1',
      [Role.RUNNER],
      { latitude: 40.4168, longitude: -3.7038 },
    );

    expect(txLocationCreate).toHaveBeenCalledWith({
      data: {
        runnerId: 'runner-1',
        latitude: 40.4168,
        longitude: -3.7038,
        recordedAt: expect.any(Date),
      },
    });
    expect(txDeliveryUpdate).toHaveBeenCalledWith({
      where: { id: 'delivery-1' },
      data: {
        lastRunnerLocationLat: 40.4168,
        lastRunnerLocationLng: -3.7038,
        lastLocationUpdateAt: expect.any(Date),
      },
    });
    expect(result).toEqual({
      deliveryOrderId: 'delivery-1',
      lastLocationUpdateAt: persistedUpdateAt,
    });
  });

  it('returns approximate location to the customer only after pickup', async () => {
    prismaMock.deliveryOrder.findUnique.mockResolvedValue({
      id: 'delivery-1',
      runnerId: 'runner-1',
      status: DeliveryOrderStatus.IN_TRANSIT,
      pickupAt: new Date('2099-01-01T00:00:00.000Z'),
      transitAt: new Date('2099-01-01T00:05:00.000Z'),
      deliveredAt: null,
      lastLocationUpdateAt: new Date('2099-01-01T00:06:00.000Z'),
      lastRunnerLocationLat: 40.4168123,
      lastRunnerLocationLng: -3.7038456,
      order: {
        clientId: 'client-1',
      },
    });

    const result = await service.getDeliveryTracking('delivery-1', 'client-1', [
      Role.CLIENT,
    ]);

    expect(result).toEqual({
      deliveryOrderId: 'delivery-1',
      status: DeliveryOrderStatus.IN_TRANSIT,
      pickupAt: new Date('2099-01-01T00:00:00.000Z'),
      transitAt: new Date('2099-01-01T00:05:00.000Z'),
      deliveredAt: null,
      lastLocationUpdateAt: new Date('2099-01-01T00:06:00.000Z'),
      currentLocation: {
        latitude: 40.417,
        longitude: -3.704,
      },
    });
  });

  it('hides current location from the customer before pickup confirmation', async () => {
    prismaMock.deliveryOrder.findUnique.mockResolvedValue({
      id: 'delivery-1',
      runnerId: 'runner-1',
      status: DeliveryOrderStatus.PICKUP_PENDING,
      pickupAt: null,
      transitAt: null,
      deliveredAt: null,
      lastLocationUpdateAt: new Date('2099-01-01T00:06:00.000Z'),
      lastRunnerLocationLat: 40.4168123,
      lastRunnerLocationLng: -3.7038456,
      order: {
        clientId: 'client-1',
      },
    });

    const result = await service.getDeliveryTracking('delivery-1', 'client-1', [
      Role.CLIENT,
    ]);

    expect(result.currentLocation).toBeNull();
  });

  it('returns exact location history to admin only within the delivery window', async () => {
    prismaMock.deliveryOrder.findUnique.mockResolvedValue({
      id: 'delivery-1',
      runnerId: 'runner-1',
      createdAt: new Date('2099-01-01T00:00:00.000Z'),
      deliveredAt: new Date('2099-01-01T00:10:00.000Z'),
    });
    prismaMock.runnerLocation.findMany.mockResolvedValue([
      {
        id: 'loc-1',
        runnerId: 'runner-1',
        latitude: 40.4168,
        longitude: -3.7038,
        recordedAt: new Date('2099-01-01T00:05:00.000Z'),
      },
    ]);

    const result = await service.getDeliveryLocationHistory('delivery-1');

    expect(prismaMock.runnerLocation.findMany).toHaveBeenCalledWith({
      where: {
        runnerId: 'runner-1',
        recordedAt: {
          gte: new Date('2099-01-01T00:00:00.000Z'),
          lte: new Date('2099-01-01T00:10:00.000Z'),
        },
      },
      orderBy: {
        recordedAt: 'asc',
      },
    });
    expect(result).toHaveLength(1);
  });

  it('cleans up old runner locations using retention policy', async () => {
    prismaMock.runnerLocation.deleteMany.mockResolvedValue({ count: 4 });

    const result = await service.cleanupRunnerLocations(
      new Date('2099-01-02T00:00:00.000Z'),
    );

    expect(prismaMock.runnerLocation.deleteMany).toHaveBeenCalledWith({
      where: {
        recordedAt: {
          lt: new Date('2099-01-01T00:00:00.000Z'),
        },
      },
    });
    expect(result).toEqual({ deletedLocations: 4 });
  });

  it('rejects excessive coordinate jumps inside the anti-spoofing window', async () => {
    prismaMock.runnerLocation.findFirst.mockResolvedValue(null);

    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        $executeRaw: jest.fn(),
        deliveryOrder: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'delivery-1',
            runnerId: 'runner-1',
            status: DeliveryOrderStatus.IN_TRANSIT,
            lastLocationUpdateAt: new Date(),
            lastRunnerLocationLat: 40.4168,
            lastRunnerLocationLng: -3.7038,
          }),
        },
        runnerProfile: {
          findUnique: jest.fn().mockResolvedValue(assignedRunner),
        },
        runnerLocation: {
          findFirst: prismaMock.runnerLocation.findFirst,
        },
      }),
    );

    await expect(
      service.updateRunnerLocation('delivery-1', 'runner-1', [Role.RUNNER], {
        latitude: 41.3874,
        longitude: 2.1686,
      }),
    ).rejects.toThrow('Runner location jump exceeds allowed threshold');
  });

  it('applies per-runner rate limiting across deliveries', async () => {
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        $executeRaw: jest.fn(),
        deliveryOrder: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'delivery-2',
            runnerId: 'runner-1',
            status: DeliveryOrderStatus.IN_TRANSIT,
            lastLocationUpdateAt: null,
          }),
        },
        runnerProfile: {
          findUnique: jest.fn().mockResolvedValue(assignedRunner),
        },
        runnerLocation: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'loc-latest',
            runnerId: 'runner-1',
            recordedAt: new Date(),
          }),
        },
      }),
    );

    await expect(
      service.updateRunnerLocation('delivery-2', 'runner-1', [Role.RUNNER], {
        latitude: 40.4168,
        longitude: -3.7038,
      }),
    ).rejects.toThrow('Runner location updates are too frequent');
  });

  it('hides delivery existence on unauthorized tracking reads', async () => {
    prismaMock.deliveryOrder.findUnique.mockResolvedValue({
      id: 'delivery-1',
      runnerId: 'runner-1',
      status: DeliveryOrderStatus.IN_TRANSIT,
      order: {
        clientId: 'client-owner',
      },
    });

    await expect(
      service.getDeliveryTracking('delivery-1', 'client-other', [Role.CLIENT]),
    ).rejects.toThrow(NotFoundException);
  });

  it('creates an incident for the client on their own delivery', async () => {
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        deliveryOrder: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'delivery-1',
            order: {
              clientId: 'client-1',
              providerOrders: [],
            },
          }),
        },
        deliveryIncident: {
          count: jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(0),
          create: jest.fn().mockResolvedValue({
            id: 'incident-1',
            deliveryOrderId: 'delivery-1',
            reporterId: 'client-1',
            reporterRole: IncidentReporterRoleValues.CLIENT,
            type: DeliveryIncidentTypeValues.MISSING_ITEMS,
            status: DeliveryIncidentStatusValues.OPEN,
            description: 'Missing item in the bag',
            evidenceUrl: 'https://cdn.example.com/photo.jpg',
            createdAt: new Date('2099-01-01T00:00:00.000Z'),
            resolvedAt: null,
          }),
        },
      }),
    );

    const result = await service.createIncident(
      {
        deliveryOrderId: 'delivery-1',
        type: DeliveryIncidentTypeValues.MISSING_ITEMS,
        description: 'Missing item in the bag',
        evidenceUrl: 'https://cdn.example.com/photo.jpg',
      },
      'client-1',
      [Role.CLIENT],
    );

    expect(result).toEqual({
      id: 'incident-1',
      deliveryOrderId: 'delivery-1',
      reporterRole: IncidentReporterRoleValues.CLIENT,
      type: DeliveryIncidentTypeValues.MISSING_ITEMS,
      status: DeliveryIncidentStatusValues.OPEN,
      description: 'Missing item in the bag',
      evidenceUrl: 'https://cdn.example.com/photo.jpg',
      createdAt: new Date('2099-01-01T00:00:00.000Z'),
      resolvedAt: null,
    });
  });

  it('rejects runner incident creation on unrelated delivery', async () => {
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        deliveryOrder: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'delivery-1',
            runnerId: 'runner-assigned',
            order: {
              clientId: 'client-1',
              providerOrders: [],
            },
          }),
        },
      }),
    );

    await expect(
      service.createIncident(
        {
          deliveryOrderId: 'delivery-1',
          type: DeliveryIncidentTypeValues.SAFETY_CONCERN,
          description: 'Unsafe situation',
        },
        'runner-other',
        [Role.RUNNER],
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects provider incident creation on unrelated order', async () => {
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        deliveryOrder: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'delivery-1',
            order: {
              clientId: 'client-1',
              providerOrders: [{ providerId: 'provider-owner' }],
            },
          }),
        },
      }),
    );

    await expect(
      service.createIncident(
        {
          deliveryOrderId: 'delivery-1',
          type: DeliveryIncidentTypeValues.OTHER,
          description: 'Packaging issue',
        },
        'provider-other',
        [Role.PROVIDER],
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('enforces incident limit per delivery per reporter', async () => {
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        deliveryOrder: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'delivery-1',
            order: {
              clientId: 'client-1',
              providerOrders: [],
            },
          }),
        },
        deliveryIncident: {
          count: jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(3),
        },
      }),
    );

    await expect(
      service.createIncident(
        {
          deliveryOrderId: 'delivery-1',
          type: DeliveryIncidentTypeValues.OTHER,
          description: 'Third duplicate issue',
        },
        'client-1',
        [Role.CLIENT],
      ),
    ).rejects.toThrow('Incident limit exceeded for this delivery order');
  });

  it('enforces incident daily rate limiting', async () => {
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        deliveryOrder: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'delivery-1',
            order: {
              clientId: 'client-1',
              providerOrders: [],
            },
          }),
        },
        deliveryIncident: {
          count: jest.fn().mockResolvedValueOnce(10),
        },
      }),
    );

    await expect(
      service.createIncident(
        {
          deliveryOrderId: 'delivery-1',
          type: DeliveryIncidentTypeValues.OTHER,
          description: 'Too many reports',
        },
        'client-1',
        [Role.CLIENT],
      ),
    ).rejects.toThrow('Daily incident limit exceeded');
  });

  it('moves incidents through a valid lifecycle and sets resolvedAt', async () => {
    prismaMock.$transaction.mockImplementationOnce(async (callback: any) =>
      callback({
        $executeRaw: jest.fn(),
        deliveryIncident: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'incident-1',
            deliveryOrderId: 'delivery-1',
            status: DeliveryIncidentStatusValues.OPEN,
            resolvedAt: null,
          }),
          update: jest.fn().mockResolvedValue({
            id: 'incident-1',
            deliveryOrderId: 'delivery-1',
            reporterRole: IncidentReporterRoleValues.CLIENT,
            type: DeliveryIncidentTypeValues.OTHER,
            status: DeliveryIncidentStatusValues.UNDER_REVIEW,
            description: 'Investigating',
            evidenceUrl: null,
            createdAt: new Date('2099-01-01T00:00:00.000Z'),
            resolvedAt: null,
          }),
        },
      }),
    );

    const underReview = await service.reviewIncident('incident-1', 'admin-1');
    expect(underReview.status).toBe(DeliveryIncidentStatusValues.UNDER_REVIEW);

    prismaMock.$transaction.mockImplementationOnce(async (callback: any) =>
      callback({
        $executeRaw: jest.fn(),
        deliveryIncident: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'incident-1',
            deliveryOrderId: 'delivery-1',
            status: DeliveryIncidentStatusValues.UNDER_REVIEW,
            resolvedAt: null,
          }),
          update: jest.fn().mockResolvedValue({
            id: 'incident-1',
            deliveryOrderId: 'delivery-1',
            reporterRole: IncidentReporterRoleValues.CLIENT,
            type: DeliveryIncidentTypeValues.OTHER,
            status: DeliveryIncidentStatusValues.RESOLVED,
            description: 'Resolved',
            evidenceUrl: null,
            createdAt: new Date('2099-01-01T00:00:00.000Z'),
            resolvedAt: new Date('2099-01-01T01:00:00.000Z'),
          }),
        },
      }),
    );

    const resolved = await service.resolveIncident('incident-1', 'admin-1');
    expect(resolved.status).toBe(DeliveryIncidentStatusValues.RESOLVED);
    expect(resolved.resolvedAt).toEqual(new Date('2099-01-01T01:00:00.000Z'));
  });

  it('does not allow changing resolved incidents again', async () => {
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        $executeRaw: jest.fn(),
        deliveryIncident: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'incident-1',
            deliveryOrderId: 'delivery-1',
            status: DeliveryIncidentStatusValues.RESOLVED,
            resolvedAt: new Date('2099-01-01T01:00:00.000Z'),
          }),
        },
      }),
    );

    await expect(
      service.rejectIncident('incident-1', 'admin-1'),
    ).rejects.toThrow('Invalid incident transition from RESOLVED to REJECTED');
  });

  it('rejects non-https incident evidence', async () => {
    await expect(
      service.createIncident(
        {
          deliveryOrderId: 'delivery-1',
          type: DeliveryIncidentTypeValues.OTHER,
          description: 'Bad evidence',
          evidenceUrl: 'http://cdn.example.com/file.jpg',
        },
        'client-1',
        [Role.CLIENT],
      ),
    ).rejects.toThrow('Incident evidenceUrl must use HTTPS');
  });

  it('allows authorized users to read incident details', async () => {
    prismaMock.deliveryIncident.findUnique.mockResolvedValue({
      id: 'incident-1',
      deliveryOrderId: 'delivery-1',
      reporterId: 'client-1',
      reporterRole: IncidentReporterRoleValues.CLIENT,
      type: DeliveryIncidentTypeValues.OTHER,
      status: DeliveryIncidentStatusValues.OPEN,
      description: 'Issue',
      evidenceUrl: null,
      createdAt: new Date('2099-01-01T00:00:00.000Z'),
      resolvedAt: null,
      deliveryOrder: {
        order: {
          clientId: 'client-1',
          providerOrders: [],
        },
      },
    });

    const result = await service.getIncident('incident-1', 'client-1', [
      Role.CLIENT,
    ]);
    expect(result.id).toBe('incident-1');
  });
});
