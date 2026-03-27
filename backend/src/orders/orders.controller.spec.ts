import { ProviderOrderStatus, Role } from '@prisma/client';
import { OrdersController } from './orders.controller';

describe('OrdersController', () => {
  let controller: OrdersController;
  let ordersServiceMock: Record<string, jest.Mock>;

  beforeEach(() => {
    ordersServiceMock = {
      create: jest.fn().mockResolvedValue({ id: 'order-1' }),
      getAvailableOrders: jest.fn().mockResolvedValue([]),
      acceptOrder: jest.fn().mockResolvedValue({ status: 'ASSIGNED' }),
      completeOrder: jest.fn().mockResolvedValue({ status: 'DELIVERED' }),
      markInTransit: jest.fn().mockResolvedValue({ status: 'IN_TRANSIT' }),
      cancelOrder: jest.fn().mockResolvedValue({ status: 'CANCELLED' }),
      getProviderStats: jest.fn().mockResolvedValue({}),
      getProviderSalesChart: jest.fn().mockResolvedValue([]),
      getProviderTopProducts: jest.fn().mockResolvedValue([]),
      updateProviderOrderStatus: jest
        .fn()
        .mockResolvedValue({ status: 'ACCEPTED' }),
      findAll: jest.fn().mockResolvedValue([]),
      getOrderTracking: jest.fn().mockResolvedValue({ id: 'order-1' }),
      findOne: jest.fn().mockResolvedValue({ id: 'order-1' }),
    };
    controller = new OrdersController(ordersServiceMock as never);
  });

  it('delegates legacy order creation and runner lifecycle operations', async () => {
    const clientReq = { user: { userId: 'client-1', roles: [Role.CLIENT] } };
    const runnerReq = { user: { userId: 'runner-1', roles: [Role.RUNNER] } };

    await controller.create({ cityId: 'city-1' } as never, clientReq as never);
    await controller.getAvailableOrders();
    await controller.acceptOrder(
      '9c1fc56f-d632-4cb0-b01e-e907c3e54eb4',
      runnerReq as never,
    );
    await controller.markInTransit(
      '9c1fc56f-d632-4cb0-b01e-e907c3e54eb4',
      runnerReq as never,
    );
    await controller.completeOrder(
      '9c1fc56f-d632-4cb0-b01e-e907c3e54eb4',
      runnerReq as never,
    );

    expect(ordersServiceMock.create).toHaveBeenCalledWith(
      { cityId: 'city-1' },
      'client-1',
    );
    expect(ordersServiceMock.getAvailableOrders).toHaveBeenCalled();
    expect(ordersServiceMock.acceptOrder).toHaveBeenCalledWith(
      '9c1fc56f-d632-4cb0-b01e-e907c3e54eb4',
      'runner-1',
    );
    expect(ordersServiceMock.markInTransit).toHaveBeenCalled();
    expect(ordersServiceMock.completeOrder).toHaveBeenCalled();
  });

  it('delegates provider, cancel, tracking, and lookup operations with full request context', async () => {
    const providerReq = {
      user: { userId: 'provider-1', roles: [Role.PROVIDER] },
    };
    const adminReq = { user: { userId: 'admin-1', roles: [Role.ADMIN] } };

    await controller.cancelOrder(
      '9c1fc56f-d632-4cb0-b01e-e907c3e54eb4',
      adminReq as never,
    );
    await controller.getProviderStats(providerReq as never);
    await controller.getProviderSalesChart(providerReq as never);
    await controller.getProviderTopProducts(providerReq as never);
    await controller.updateProviderOrderStatus(
      '9c1fc56f-d632-4cb0-b01e-e907c3e54eb4',
      ProviderOrderStatus.ACCEPTED,
      providerReq as never,
    );
    await controller.findAll(providerReq as never);
    await controller.getTracking(
      '9c1fc56f-d632-4cb0-b01e-e907c3e54eb4',
      providerReq as never,
    );
    await controller.findOne(
      '9c1fc56f-d632-4cb0-b01e-e907c3e54eb4',
      providerReq as never,
    );

    expect(ordersServiceMock.cancelOrder).toHaveBeenCalledWith(
      '9c1fc56f-d632-4cb0-b01e-e907c3e54eb4',
      'admin-1',
      [Role.ADMIN],
    );
    expect(ordersServiceMock.getProviderStats).toHaveBeenCalledWith(
      'provider-1',
    );
    expect(ordersServiceMock.getProviderSalesChart).toHaveBeenCalledWith(
      'provider-1',
    );
    expect(ordersServiceMock.getProviderTopProducts).toHaveBeenCalledWith(
      'provider-1',
    );
    expect(ordersServiceMock.updateProviderOrderStatus).toHaveBeenCalledWith(
      '9c1fc56f-d632-4cb0-b01e-e907c3e54eb4',
      'provider-1',
      [Role.PROVIDER],
      ProviderOrderStatus.ACCEPTED,
    );
    expect(ordersServiceMock.findAll).toHaveBeenCalledWith('provider-1', [
      Role.PROVIDER,
    ]);
    expect(ordersServiceMock.getOrderTracking).toHaveBeenCalledWith(
      '9c1fc56f-d632-4cb0-b01e-e907c3e54eb4',
      'provider-1',
      [Role.PROVIDER],
    );
    expect(ordersServiceMock.findOne).toHaveBeenCalledWith(
      '9c1fc56f-d632-4cb0-b01e-e907c3e54eb4',
      'provider-1',
      [Role.PROVIDER],
    );
  });
});
