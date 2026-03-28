import { ConflictException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { DemoOrderScenarioService } from './demo-order-scenario.service';
import { DEMO_ORDER_SCENARIOS } from './demo.seed-data';

describe('DemoOrderScenarioService', () => {
  let service: DemoOrderScenarioService;
  let prismaMock: any;
  let cartServiceMock: any;
  let ordersServiceMock: any;
  let deliveryServiceMock: any;
  let paymentsServiceMock: any;

  beforeEach(() => {
    prismaMock = {
      user: { findUnique: jest.fn() },
      order: { findUnique: jest.fn() },
      deliveryIncident: { create: jest.fn() },
      refundRequest: { create: jest.fn() },
      providerPaymentSession: { update: jest.fn() },
      providerOrder: { update: jest.fn() },
    };
    cartServiceMock = { addItem: jest.fn().mockResolvedValue(undefined) };
    ordersServiceMock = {
      checkoutFromCart: jest.fn(),
      prepareProviderOrderPayment: jest.fn(),
    };
    deliveryServiceMock = {
      createDeliveryOrder: jest.fn(),
      assignRunner: jest.fn(),
      markPickupPending: jest.fn(),
      confirmPickup: jest.fn(),
      startTransit: jest.fn(),
      updateRunnerLocation: jest.fn(),
      confirmDelivery: jest.fn(),
    };
    paymentsServiceMock = {
      confirmProviderOrderPayment: jest.fn(),
    };

    service = new DemoOrderScenarioService(
      prismaMock,
      cartServiceMock,
      ordersServiceMock,
      deliveryServiceMock,
      paymentsServiceMock,
    );
  });

  it('fails when a demo user cannot be found', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(
      (service as any).findUserByEmail('missing@local.test'),
    ).rejects.toThrow(
      new NotFoundException('Demo user missing@local.test was not created'),
    );
  });

  it('rejects provider payment confirmation when the order is not single-provider', async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: 'order-1',
      providerOrders: [],
    });

    await expect(
      (service as any).confirmDemoProviderOrderPayment('order-1'),
    ).rejects.toThrow(
      new ConflictException(
        'Demo payment confirmation requires a single-provider order',
      ),
    );
  });

  it('rejects provider payment confirmation when provider has no stripe account', async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: 'order-1',
      providerOrders: [
        {
          id: 'po-1',
          providerId: 'provider-1',
          subtotalAmount: 12.5,
        },
      ],
    });
    ordersServiceMock.prepareProviderOrderPayment.mockResolvedValue({
      id: 'session-1',
    });
    prismaMock.user.findUnique.mockResolvedValue({ stripeAccountId: null });

    await expect(
      (service as any).confirmDemoProviderOrderPayment('order-1'),
    ).rejects.toThrow(
      new ConflictException(
        'Demo provider is missing a connected account bootstrap value',
      ),
    );
  });

  it('rejects demo order creation when a required product is missing', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user.demo@local.test',
      name: 'User',
      roles: [Role.CLIENT],
      verificationToken: null,
      stripeAccountId: null,
    });

    await expect(
      service.createDemoOrders([
        {
          id: 'prod-1',
          name: 'Pan artesano',
          cityId: 'city-toledo',
          citySlug: 'toledo',
        },
      ]),
    ).rejects.toThrow(
      new ConflictException(
        "Missing demo product 'Cuenco de cerámica toledana'",
      ),
    );
  });

  it('creates the demo order scenarios on the happy path', async () => {
    const users = new Map([
      ['user.demo@local.test', { id: 'user-1', roles: [Role.CLIENT] }],
      ['user2.demo@local.test', { id: 'user-2', roles: [Role.CLIENT] }],
      [
        'madrid.runner.demo@local.test',
        { id: 'runner-madrid', roles: [Role.RUNNER] },
      ],
      [
        'valencia.runner.demo@local.test',
        { id: 'runner-valencia', roles: [Role.RUNNER] },
      ],
      [
        'sevilla.runner.demo@local.test',
        { id: 'runner-sevilla', roles: [Role.RUNNER] },
      ],
      [
        'bilbao.runner.demo@local.test',
        { id: 'runner-bilbao', roles: [Role.RUNNER] },
      ],
    ]);
    prismaMock.user.findUnique.mockImplementation(({ where: { email } }: any) =>
      Promise.resolve(users.get(email) ?? null),
    );

    const orders = [
      { id: 'order-pending', deliveryFee: 4.5 },
      { id: 'order-in-transit', deliveryFee: 5.1 },
      { id: 'order-delivered', deliveryFee: 5.4 },
      { id: 'order-assigned', deliveryFee: 4.2 },
      { id: 'order-support', deliveryFee: 4.8 },
    ];
    ordersServiceMock.checkoutFromCart
      .mockResolvedValueOnce(orders[0])
      .mockResolvedValueOnce(orders[1])
      .mockResolvedValueOnce(orders[2])
      .mockResolvedValueOnce(orders[3])
      .mockResolvedValueOnce(orders[4]);
    jest
      .spyOn(service as any, 'confirmDemoProviderOrderPayment')
      .mockResolvedValue(undefined);
    deliveryServiceMock.createDeliveryOrder
      .mockResolvedValueOnce({ id: 'delivery-1' })
      .mockResolvedValueOnce({ id: 'delivery-2' })
      .mockResolvedValueOnce({ id: 'delivery-3' })
      .mockResolvedValueOnce({ id: 'delivery-4' });
    deliveryServiceMock.assignRunner.mockResolvedValue({});
    deliveryServiceMock.markPickupPending.mockResolvedValue({});
    deliveryServiceMock.confirmPickup.mockResolvedValue({});
    deliveryServiceMock.startTransit.mockResolvedValue({});
    deliveryServiceMock.updateRunnerLocation.mockResolvedValue({});
    deliveryServiceMock.confirmDelivery.mockResolvedValue({});
    prismaMock.order.findUnique.mockResolvedValue({
      providerOrders: [{ id: 'provider-order-support' }],
      deliveryOrder: { id: 'delivery-4' },
    });
    prismaMock.deliveryIncident.create.mockResolvedValue({ id: 'incident-1' });
    prismaMock.refundRequest.create.mockResolvedValue({});

    const result = await service.createDemoOrders([
      {
        id: 'prod-1',
        name: 'Pan artesano',
        cityId: 'city-toledo',
        citySlug: 'toledo',
      },
      {
        id: 'prod-2',
        name: 'Cuenco de cerámica toledana',
        cityId: 'city-toledo',
        citySlug: 'toledo',
      },
      {
        id: 'prod-3',
        name: 'Ramo de temporada',
        cityId: 'city-madrid',
        citySlug: 'madrid',
      },
      {
        id: 'prod-4',
        name: 'Planta aromática',
        cityId: 'city-madrid',
        citySlug: 'madrid',
      },
      {
        id: 'prod-5',
        name: 'Naranjas dulces',
        cityId: 'city-valencia',
        citySlug: 'valencia',
      },
      {
        id: 'prod-6',
        name: 'Arroz de la Albufera',
        cityId: 'city-valencia',
        citySlug: 'valencia',
      },
      {
        id: 'prod-7',
        name: 'Cartera de piel',
        cityId: 'city-sevilla',
        citySlug: 'sevilla',
      },
      {
        id: 'prod-8',
        name: 'Café de tueste local',
        cityId: 'city-bilbao',
        citySlug: 'bilbao',
      },
      {
        id: 'prod-9',
        name: 'Chocolate artesano',
        cityId: 'city-bilbao',
        citySlug: 'bilbao',
      },
    ]);

    expect(ordersServiceMock.checkoutFromCart).toHaveBeenCalledTimes(
      DEMO_ORDER_SCENARIOS.length,
    );
    expect(
      (service as any).confirmDemoProviderOrderPayment,
    ).toHaveBeenCalledTimes(4);
    expect(deliveryServiceMock.createDeliveryOrder).toHaveBeenCalledTimes(4);
    expect(deliveryServiceMock.assignRunner).toHaveBeenNthCalledWith(
      1,
      'delivery-1',
      { runnerId: 'runner-madrid' },
      'user-1',
      [Role.CLIENT],
    );
    expect(deliveryServiceMock.assignRunner).toHaveBeenNthCalledWith(
      2,
      'delivery-2',
      { runnerId: 'runner-valencia' },
      'user-2',
      [Role.CLIENT],
    );
    expect(deliveryServiceMock.confirmDelivery).toHaveBeenCalledWith(
      'delivery-2',
      'runner-valencia',
      [Role.RUNNER],
      { deliveryNotes: 'Entrega demo completada en Valencia' },
    );
    expect(deliveryServiceMock.markPickupPending).toHaveBeenCalledTimes(3);
    expect(deliveryServiceMock.confirmPickup).toHaveBeenCalledTimes(3);
    expect(deliveryServiceMock.startTransit).toHaveBeenCalledTimes(3);
    expect(deliveryServiceMock.updateRunnerLocation).toHaveBeenCalledTimes(3);
    expect(prismaMock.deliveryIncident.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deliveryOrderId: 'delivery-4',
          reporterId: 'user-1',
        }),
      }),
    );
    expect(prismaMock.refundRequest.create).toHaveBeenCalledTimes(2);
    expect(result).toEqual(orders);
  });
});
