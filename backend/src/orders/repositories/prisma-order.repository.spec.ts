import {
  DeliveryStatus,
  ProviderOrderStatus,
  type Order,
  type ProviderOrder,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PrismaOrderRepository } from './prisma-order.repository';

describe('PrismaOrderRepository', () => {
  const createPrismaMock = () => ({
    order: {
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
    },
    providerOrder: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    product: {
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  });

  it('delegates basic order queries and updates to Prisma', async () => {
    const prisma = createPrismaMock();
    const repository = new PrismaOrderRepository(
      prisma as unknown as PrismaService,
    );
    const order = { id: 'order-1' } as Order;

    prisma.order.findUnique.mockResolvedValue(order);
    prisma.order.update.mockResolvedValue(order);
    prisma.order.findMany.mockResolvedValue([order]);
    prisma.order.count.mockResolvedValue(2);

    await expect(repository.findById('order-1')).resolves.toBe(order);
    await expect(
      repository.update('order-1', { status: DeliveryStatus.ASSIGNED }),
    ).resolves.toBe(order);
    await expect(
      repository.findByClientId('client-1', {
        skip: 10,
        take: 5,
        status: DeliveryStatus.ASSIGNED,
      }),
    ).resolves.toEqual([order]);
    await expect(repository.countByClient('client-1')).resolves.toBe(2);

    expect(prisma.order.findUnique).toHaveBeenCalledWith({
      where: { id: 'order-1' },
    });
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { status: DeliveryStatus.ASSIGNED },
    });
    expect(prisma.order.findMany).toHaveBeenCalledWith({
      where: { clientId: 'client-1', status: DeliveryStatus.ASSIGNED },
      skip: 10,
      take: 5,
      orderBy: { createdAt: 'desc' },
    });
    expect(prisma.order.count).toHaveBeenCalledWith({
      where: { clientId: 'client-1' },
    });
  });

  it('omits optional status filters when listing client orders', async () => {
    const prisma = createPrismaMock();
    const repository = new PrismaOrderRepository(
      prisma as unknown as PrismaService,
    );

    prisma.order.findMany.mockResolvedValue([]);

    await repository.findByClientId('client-2');

    expect(prisma.order.findMany).toHaveBeenCalledWith({
      where: { clientId: 'client-2' },
      skip: undefined,
      take: undefined,
      orderBy: { createdAt: 'desc' },
    });
  });

  it('loads composite order views and provider-order lookups', async () => {
    const prisma = createPrismaMock();
    const repository = new PrismaOrderRepository(
      prisma as unknown as PrismaService,
    );
    const orderWithProviderOrders = {
      id: 'order-1',
      providerOrders: [],
    };
    const providerOrder = { id: 'provider-1' } as ProviderOrder;

    prisma.order.findUnique
      .mockResolvedValueOnce(orderWithProviderOrders)
      .mockResolvedValueOnce(orderWithProviderOrders);
    prisma.providerOrder.findUnique
      .mockResolvedValueOnce({ id: 'provider-1', order: { id: 'order-1' } })
      .mockResolvedValueOnce(providerOrder);

    await expect(repository.findWithProviderOrders('order-1')).resolves.toEqual(
      orderWithProviderOrders,
    );
    await expect(
      repository.findWithProviderOrdersAndItems('order-1'),
    ).resolves.toEqual(orderWithProviderOrders);
    await expect(
      repository.findProviderOrderWithOrder('provider-1'),
    ).resolves.toEqual({ id: 'provider-1', order: { id: 'order-1' } });
    await expect(repository.findProviderOrderById('provider-1')).resolves.toBe(
      providerOrder,
    );

    expect(prisma.order.findUnique).toHaveBeenNthCalledWith(1, {
      where: { id: 'order-1' },
      include: { providerOrders: true },
    });
    expect(prisma.order.findUnique).toHaveBeenNthCalledWith(2, {
      where: { id: 'order-1' },
      include: { providerOrders: { include: { items: true } } },
    });
    expect(prisma.providerOrder.findUnique).toHaveBeenNthCalledWith(1, {
      where: { id: 'provider-1' },
      include: { order: true },
    });
    expect(prisma.providerOrder.findUnique).toHaveBeenNthCalledWith(2, {
      where: { id: 'provider-1' },
    });
  });

  it('applies optimistic provider-order transitions and bulk updates', async () => {
    const prisma = createPrismaMock();
    const repository = new PrismaOrderRepository(
      prisma as unknown as PrismaService,
    );

    prisma.providerOrder.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 2 });

    await expect(
      repository.updateProviderOrderStatusOptimistic(
        'provider-1',
        ProviderOrderStatus.PENDING,
        ProviderOrderStatus.ACCEPTED,
      ),
    ).resolves.toBe(1);
    await expect(
      repository.updateManyProviderOrdersStatus(
        ['provider-1', 'provider-2'],
        ProviderOrderStatus.CANCELLED,
      ),
    ).resolves.toBeUndefined();

    expect(prisma.providerOrder.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'provider-1', status: ProviderOrderStatus.PENDING },
      data: { status: ProviderOrderStatus.ACCEPTED },
    });
    expect(prisma.providerOrder.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: { in: ['provider-1', 'provider-2'] } },
      data: { status: ProviderOrderStatus.CANCELLED },
    });
  });

  it('applies optimistic order acceptance and completion', async () => {
    const prisma = createPrismaMock();
    const repository = new PrismaOrderRepository(
      prisma as unknown as PrismaService,
    );

    prisma.order.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });

    await expect(
      repository.acceptOrderOptimistic('order-1', 'runner-1'),
    ).resolves.toBe(1);
    await expect(
      repository.completeOrderOptimistic('order-1', 'runner-1'),
    ).resolves.toBe(1);

    expect(prisma.order.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: 'order-1',
        status: DeliveryStatus.READY_FOR_ASSIGNMENT,
        runnerId: null,
        clientId: { not: 'runner-1' },
      },
      data: { runnerId: 'runner-1', status: DeliveryStatus.ASSIGNED },
    });
    expect(prisma.order.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'order-1',
        runnerId: 'runner-1',
        status: DeliveryStatus.IN_TRANSIT,
      },
      data: { status: DeliveryStatus.DELIVERED },
    });
  });

  it('updates order status and reads runner profile data', async () => {
    const prisma = createPrismaMock();
    const repository = new PrismaOrderRepository(
      prisma as unknown as PrismaService,
    );
    const order = { id: 'order-1' } as Order;
    const profile = {
      stripeAccountId: 'acct_123',
      runnerProfile: { isActive: true },
    };

    prisma.order.update.mockResolvedValue(order);
    prisma.user.findUnique.mockResolvedValue(profile);

    await expect(
      repository.updateStatus('order-1', DeliveryStatus.CANCELLED),
    ).resolves.toBe(order);
    await expect(repository.findRunnerProfile('runner-1')).resolves.toEqual(
      profile,
    );

    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { status: DeliveryStatus.CANCELLED },
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'runner-1' },
      select: {
        stripeAccountId: true,
        runnerProfile: { select: { isActive: true } },
      },
    });
  });

  it('cancels orders inside a transaction and restores inventory', async () => {
    const prisma = createPrismaMock();
    const tx = {
      product: { update: jest.fn() },
      providerOrder: { updateMany: jest.fn() },
      order: { update: jest.fn() },
    };
    const repository = new PrismaOrderRepository(
      prisma as unknown as PrismaService,
    );
    const updatedOrder = { id: 'order-1', providerOrders: [] };

    prisma.$transaction.mockImplementation(async (callback) => callback(tx));
    tx.order.update.mockResolvedValue(updatedOrder);

    await expect(
      repository.cancelWithInventoryRestore(
        'order-1',
        ['provider-1'],
        [
          { productId: 'product-1', quantity: 2 },
          { productId: 'product-2', quantity: 1 },
        ],
      ),
    ).resolves.toEqual(updatedOrder);

    expect(tx.product.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'product-1' },
      data: { stock: { increment: 2 } },
    });
    expect(tx.product.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'product-2' },
      data: { stock: { increment: 1 } },
    });
    expect(tx.providerOrder.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['provider-1'] } },
      data: { status: ProviderOrderStatus.CANCELLED },
    });
    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { status: DeliveryStatus.CANCELLED },
      include: { providerOrders: { include: { items: true } } },
    });
  });

  it('skips provider-order cancellation when there are no provider orders to cancel', async () => {
    const prisma = createPrismaMock();
    const tx = {
      product: { update: jest.fn() },
      providerOrder: { updateMany: jest.fn() },
      order: { update: jest.fn() },
    };
    const repository = new PrismaOrderRepository(
      prisma as unknown as PrismaService,
    );

    prisma.$transaction.mockImplementation(async (callback) => callback(tx));
    tx.order.update.mockResolvedValue({ id: 'order-2', providerOrders: [] });

    await repository.cancelWithInventoryRestore('order-2', [], []);

    expect(tx.providerOrder.updateMany).not.toHaveBeenCalled();
    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: 'order-2' },
      data: { status: DeliveryStatus.CANCELLED },
      include: { providerOrders: { include: { items: true } } },
    });
  });
});
