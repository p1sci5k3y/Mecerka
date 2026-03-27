import { Prisma } from '@prisma/client';
import { AppService } from './app.service';

describe('AppService', () => {
  let prismaMock: {
    $queryRaw: jest.Mock;
    user: { count: jest.Mock };
    order: { count: jest.Mock };
    deliveryOrder: { count: jest.Mock };
    product: { count: jest.Mock };
  };
  let service: AppService;

  beforeEach(() => {
    prismaMock = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
      user: { count: jest.fn().mockResolvedValue(5) },
      order: { count: jest.fn().mockResolvedValue(3) },
      deliveryOrder: { count: jest.fn().mockResolvedValue(2) },
      product: { count: jest.fn().mockResolvedValue(7) },
    };
    service = new AppService(prismaMock as never);
  });

  it('returns a healthy status when the database probe succeeds', async () => {
    const result = await service.getHealth();

    expect(prismaMock.$queryRaw).toHaveBeenCalledWith(Prisma.sql`SELECT 1`);
    expect(result.status).toBe('ok');
    expect(result.services.database).toBe('ok');
  });

  it('returns the root greeting for smoke endpoints', () => {
    expect(service.getHello()).toBe('Hello World!');
  });

  it('returns an error status when the database probe fails', async () => {
    prismaMock.$queryRaw.mockRejectedValueOnce(new Error('db down'));

    const result = await service.getHealth();

    expect(result.status).toBe('error');
    expect(result.services.database).toBe('error');
  });

  it('aggregates dashboard metrics from prisma counters', async () => {
    prismaMock.user.count.mockResolvedValueOnce(10).mockResolvedValueOnce(4);
    prismaMock.order.count
      .mockResolvedValueOnce(50)
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(6)
      .mockResolvedValueOnce(36);
    prismaMock.deliveryOrder.count.mockResolvedValueOnce(5);
    prismaMock.product.count.mockResolvedValueOnce(11);

    const result = await service.getMetrics();

    expect(result).toEqual({
      users: 10,
      providers: 4,
      orders: {
        total: 50,
        pending: 8,
        delivering: 6,
        delivered: 36,
      },
      deliveriesActive: 5,
      products: 11,
    });
    expect(prismaMock.user.count).toHaveBeenNthCalledWith(1);
    expect(prismaMock.user.count).toHaveBeenNthCalledWith(2, {
      where: { roles: { has: 'PROVIDER' } },
    });
    expect(prismaMock.order.count).toHaveBeenNthCalledWith(1);
    expect(prismaMock.order.count).toHaveBeenNthCalledWith(2, {
      where: {
        status: {
          in: ['PENDING', 'CONFIRMED', 'READY_FOR_ASSIGNMENT'],
        },
      },
    });
    expect(prismaMock.order.count).toHaveBeenNthCalledWith(3, {
      where: {
        status: {
          in: ['ASSIGNED', 'IN_TRANSIT'],
        },
      },
    });
    expect(prismaMock.order.count).toHaveBeenNthCalledWith(4, {
      where: { status: 'DELIVERED' },
    });
    expect(prismaMock.deliveryOrder.count).toHaveBeenCalledWith({
      where: {
        status: {
          in: ['RUNNER_ASSIGNED', 'PICKUP_PENDING', 'PICKED_UP', 'IN_TRANSIT'],
        },
      },
    });
    expect(prismaMock.product.count).toHaveBeenCalledWith({
      where: { isActive: true },
    });
  });
});
