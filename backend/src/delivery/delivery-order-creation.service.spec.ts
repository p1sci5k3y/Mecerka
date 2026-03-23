import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  DeliveryJobStatus,
  DeliveryOrderStatus,
  RunnerPaymentStatus,
  Role,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DeliveryDispatchService } from './delivery-dispatch.service';
import { DeliveryOrderCreationService } from './delivery-order-creation.service';

describe('DeliveryOrderCreationService', () => {
  let service: DeliveryOrderCreationService;
  let prismaMock: {
    $transaction: jest.Mock;
  };
  let dispatchServiceMock: {
    createInitialDeliveryJob: jest.Mock;
  };

  beforeEach(async () => {
    prismaMock = {
      $transaction: jest.fn(),
    };
    dispatchServiceMock = {
      createInitialDeliveryJob: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeliveryOrderCreationService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: DeliveryDispatchService, useValue: dispatchServiceMock },
      ],
    }).compile();

    service = module.get<DeliveryOrderCreationService>(
      DeliveryOrderCreationService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('creates a delivery order and the initial dispatch job', async () => {
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        $executeRaw: jest.fn(),
        order: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'order-1',
            clientId: 'client-1',
            deliveryFee: 6.5,
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
      }),
    );
    dispatchServiceMock.createInitialDeliveryJob.mockResolvedValue({
      id: 'job-1',
      deliveryOrderId: 'delivery-1',
      status: DeliveryJobStatus.OPEN,
    });

    const result = await service.createDeliveryOrder(
      { orderId: 'order-1', deliveryFee: 6.5, currency: 'EUR' },
      'client-1',
      [Role.CLIENT],
    );

    expect(dispatchServiceMock.createInitialDeliveryJob).toHaveBeenCalledWith(
      expect.any(Object),
      'delivery-1',
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 'delivery-1',
        status: DeliveryOrderStatus.PENDING,
      }),
    );
  });

  it('rejects missing orders', async () => {
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        $executeRaw: jest.fn(),
        order: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      }),
    );

    await expect(
      service.createDeliveryOrder(
        { orderId: 'missing', deliveryFee: 6.5, currency: 'EUR' },
        'client-1',
        [Role.CLIENT],
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects access from another client', async () => {
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        $executeRaw: jest.fn(),
        order: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'order-1',
            clientId: 'client-2',
            deliveryFee: 6.5,
            deliveryOrder: null,
          }),
        },
      }),
    );

    await expect(
      service.createDeliveryOrder(
        { orderId: 'order-1', deliveryFee: 6.5, currency: 'EUR' },
        'client-1',
        [Role.CLIENT],
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects mismatched delivery fees', async () => {
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        $executeRaw: jest.fn(),
        order: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'order-1',
            clientId: 'client-1',
            deliveryFee: 7.5,
            deliveryOrder: null,
          }),
        },
      }),
    );

    await expect(
      service.createDeliveryOrder(
        { orderId: 'order-1', deliveryFee: 6.5, currency: 'EUR' },
        'client-1',
        [Role.CLIENT],
      ),
    ).rejects.toThrow(ConflictException);
  });
});
