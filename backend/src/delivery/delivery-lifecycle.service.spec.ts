import { ConflictException, ForbiddenException } from '@nestjs/common';
import { DeliveryOrderStatus, Role } from '@prisma/client';
import { DeliveryDomainPolicy } from './delivery-domain-policy';
import { DeliveryLifecycleService } from './delivery-lifecycle.service';

describe('DeliveryLifecycleService', () => {
  let service: DeliveryLifecycleService;
  let prismaMock: any;
  let logger: { log: jest.Mock };
  let logStructuredEvent: jest.Mock;

  beforeEach(() => {
    prismaMock = {
      $transaction: jest.fn(),
    };
    logger = { log: jest.fn() };
    logStructuredEvent = jest.fn();

    service = new DeliveryLifecycleService(
      prismaMock,
      new DeliveryDomainPolicy(),
      logger as any,
      logStructuredEvent,
    );
  });

  it('sets pickupAt only once when pickup is confirmed repeatedly', async () => {
    const firstPickupAt = new Date('2099-01-01T00:00:00.000Z');
    const tx = {
      $executeRaw: jest.fn(),
      runnerProfile: {
        findUnique: jest.fn().mockResolvedValue({
          isActive: true,
          user: { active: true },
        }),
      },
      deliveryOrder: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'delivery-1',
            orderId: 'order-1',
            runnerId: 'runner-1',
            status: DeliveryOrderStatus.PICKUP_PENDING,
            pickupAt: null,
            transitAt: null,
            deliveredAt: null,
          })
          .mockResolvedValueOnce({
            id: 'delivery-1',
            orderId: 'order-1',
            runnerId: 'runner-1',
            status: DeliveryOrderStatus.PICKED_UP,
            pickupAt: firstPickupAt,
            transitAt: null,
            deliveredAt: null,
          }),
        update: jest.fn().mockResolvedValueOnce({
          id: 'delivery-1',
          status: DeliveryOrderStatus.PICKED_UP,
          pickupAt: firstPickupAt,
        }),
      },
    };
    prismaMock.$transaction
      .mockImplementationOnce(async (callback: any) => callback(tx))
      .mockImplementationOnce(async (callback: any) => callback(tx));

    const first = await service.confirmPickup('delivery-1', 'runner-1', [
      Role.RUNNER,
    ]);
    const second = await service.confirmPickup('delivery-1', 'runner-1', [
      Role.RUNNER,
    ]);

    expect(first.status).toBe(DeliveryOrderStatus.PICKED_UP);
    expect(second.pickupAt).toEqual(firstPickupAt);
  });

  it('rejects invalid lifecycle transitions', async () => {
    const tx = {
      $executeRaw: jest.fn(),
      runnerProfile: {
        findUnique: jest.fn().mockResolvedValue({
          isActive: true,
          user: { active: true },
        }),
      },
      deliveryOrder: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'delivery-1',
          orderId: 'order-1',
          runnerId: 'runner-1',
          status: DeliveryOrderStatus.RUNNER_ASSIGNED,
          pickupAt: null,
          transitAt: null,
          deliveredAt: null,
        }),
      },
    };
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback(tx),
    );

    await expect(
      service.startTransit('delivery-1', 'runner-1', [Role.RUNNER]),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects lifecycle updates from a runner who is not assigned', async () => {
    const tx = {
      $executeRaw: jest.fn(),
      deliveryOrder: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'delivery-1',
          orderId: 'order-1',
          runnerId: 'runner-1',
          status: DeliveryOrderStatus.RUNNER_ASSIGNED,
        }),
      },
    };
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback(tx),
    );

    await expect(
      service.markPickupPending('delivery-1', 'runner-other', [Role.RUNNER]),
    ).rejects.toThrow(ForbiddenException);
  });
});
