import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrderQueryService } from './order-query.service';
import { OrderItemsService } from './order-items.service';
import { OrderStatusService } from './order-status.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GEOCODING_SERVICE } from '../geocoding/geocoding.constants';
import { IOrderRepository } from './repositories/order.repository.interface';
import { DeliveryStatus, ProviderOrderStatus } from '@prisma/client';

const CLIENT_ID = 'client-1';
const PROVIDER_ID = 'provider-1';
const PRODUCT_ID = 'prod-1';
const ORDER_ID = 'order-1';
const PROVIDER_ORDER_ID = 'po-1';

const validCheckoutDto = {
  cityId: 'city-1',
  deliveryAddress: 'Calle Mayor 1',
  postalCode: '28013',
  addressReference: 'Portal 2',
  discoveryRadiusKm: 6,
};

const buildCity = (overrides: any = {}) => ({
  id: 'city-1',
  name: 'Madrid',
  active: true,
  maxDeliveryRadiusKm: 10,
  baseDeliveryFee: 3.5,
  deliveryPerKmFee: 0.9,
  extraPickupFee: 1.5,
  ...overrides,
});

const buildItem = (
  productId: string,
  quantity: number,
  price: number,
): any => ({
  id: `item-${productId}`,
  productId,
  quantity,
  effectiveUnitPriceSnapshot: price,
  unitPriceSnapshot: price,
  discountPriceSnapshot: null,
});

const buildCart = (providers: any[], cityOverrides: any = {}) => ({
  id: 'cart-1',
  clientId: CLIENT_ID,
  cityId: 'city-1',
  status: 'ACTIVE',
  city: buildCity(cityOverrides),
  providers,
});

const buildProvider = (providerId: string, items: any[]) => ({
  id: `cp-${providerId}`,
  providerId,
  subtotalAmount: items.reduce(
    (sum: number, i: any) => sum + i.effectiveUnitPriceSnapshot * i.quantity,
    0,
  ),
  items,
});

describe('OrdersService - checkoutFromCart', () => {
  let service: OrdersService;
  let prismaMock: any;
  let geocodingMock: any;

  beforeEach(async () => {
    prismaMock = {
      order: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      orderSummaryDocument: { create: jest.fn() },
      cartGroup: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      stockReservation: {
        findMany: jest.fn(),
        createMany: jest.fn(),
        groupBy: jest.fn(),
      },
      product: { findMany: jest.fn() },
      providerOrder: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      providerPaymentSession: {
        create: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    geocodingMock = {
      geocodeAddress: jest.fn().mockResolvedValue({
        latitude: 40.4168,
        longitude: -3.7038,
        formattedAddress: 'Calle Mayor 1, 28013 Madrid, Spain',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        OrderStatusService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: GEOCODING_SERVICE, useValue: geocodingMock },
        {
          provide: OrderItemsService,
          useValue: {
            getProviderStats: jest.fn(),
            getProviderSalesChart: jest.fn(),
            getProviderTopProducts: jest.fn(),
          },
        },
        {
          provide: IOrderRepository,
          useValue: { findById: jest.fn(), update: jest.fn() },
        },
        OrderQueryService,
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── Helper: set up full happy-path mocks ────────────────────────────────

  function setupHappyPath(
    items: any[] = [buildItem(PRODUCT_ID, 2, 10)],
    productStock = 10,
  ) {
    prismaMock.order.findUnique.mockResolvedValue(null); // no idempotent order yet

    const provider = buildProvider(PROVIDER_ID, items);
    prismaMock.cartGroup.findFirst.mockResolvedValue(buildCart([provider]));

    prismaMock.user.findMany.mockResolvedValue([
      {
        id: PROVIDER_ID,
        latitude: 40.41,
        longitude: -3.7,
        providerServiceRadiusKm: 10,
      },
    ]);

    const txMock = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      product: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: PRODUCT_ID, stock: productStock }]),
      },
      stockReservation: { groupBy: jest.fn().mockResolvedValue([]) },
      order: {
        create: jest.fn().mockResolvedValue({
          id: ORDER_ID,
          clientId: CLIENT_ID,
          status: DeliveryStatus.PENDING,
          providerOrders: [
            {
              id: PROVIDER_ORDER_ID,
              providerId: PROVIDER_ID,
              status: ProviderOrderStatus.PENDING,
              items: items.map((i) => ({
                id: `oi-${i.productId}`,
                productId: i.productId,
                quantity: i.quantity,
              })),
            },
          ],
        }),
      },
      orderSummaryDocument: { create: jest.fn().mockResolvedValue({}) },
      cartGroup: { update: jest.fn().mockResolvedValue({}) },
    };

    prismaMock.$transaction.mockImplementation((cb: any) => cb(txMock));
    prismaMock.stockReservation.createMany.mockResolvedValue({ count: 1 });

    prismaMock.order.findUniqueOrThrow.mockResolvedValue({
      id: ORDER_ID,
      clientId: CLIENT_ID,
      status: DeliveryStatus.PENDING,
      summaryDocument: null,
      providerOrders: [
        {
          id: PROVIDER_ORDER_ID,
          providerId: PROVIDER_ID,
          status: ProviderOrderStatus.PENDING,
          items: items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
          })),
          reservations: [{ expiresAt: new Date(Date.now() + 15 * 60 * 1000) }],
        },
      ],
    });

    return txMock;
  }

  // ─── Test 1: empty cart ───────────────────────────────────────────────────

  describe('empty cart validation', () => {
    it('lanza BadRequestException si el carrito está vacío', async () => {
      prismaMock.order.findUnique.mockResolvedValue(null);
      prismaMock.cartGroup.findFirst.mockResolvedValue(
        buildCart([]), // no providers
      );

      await expect(
        service.checkoutFromCart(CLIENT_ID, validCheckoutDto as any, 'idem-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException si no hay carrito activo', async () => {
      prismaMock.order.findUnique.mockResolvedValue(null);
      prismaMock.cartGroup.findFirst.mockResolvedValue(null);

      await expect(
        service.checkoutFromCart(CLIENT_ID, validCheckoutDto as any, 'idem-2'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── Test 2: producto no existe ───────────────────────────────────────────

  it('lanza ConflictException si algún producto no existe en la base de datos', async () => {
    prismaMock.order.findUnique.mockResolvedValue(null);
    const item = buildItem('prod-nonexistent', 1, 5);
    prismaMock.cartGroup.findFirst.mockResolvedValue(
      buildCart([buildProvider(PROVIDER_ID, [item])]),
    );

    prismaMock.user.findMany.mockResolvedValue([
      {
        id: PROVIDER_ID,
        latitude: 40.41,
        longitude: -3.7,
        providerServiceRadiusKm: 10,
      },
    ]);

    const txMock = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      // Product doesn't exist → findMany returns empty array
      product: { findMany: jest.fn().mockResolvedValue([]) },
      stockReservation: { groupBy: jest.fn().mockResolvedValue([]) },
      order: { create: jest.fn() },
      orderSummaryDocument: { create: jest.fn() },
      cartGroup: { update: jest.fn() },
    };
    prismaMock.$transaction.mockImplementation((cb: any) => cb(txMock));

    // When product is not found, productStock.get returns undefined → NaN → STOCK_UNAVAILABLE
    await expect(
      service.checkoutFromCart(CLIENT_ID, validCheckoutDto as any, 'idem-3'),
    ).rejects.toThrow(ConflictException);

    await expect(
      service.checkoutFromCart(CLIENT_ID, validCheckoutDto as any, 'idem-3b'),
    ).rejects.toThrow('STOCK_UNAVAILABLE');
  });

  // ─── Test 3: stock insuficiente ───────────────────────────────────────────

  it('lanza ConflictException si no hay stock suficiente', async () => {
    prismaMock.order.findUnique.mockResolvedValue(null);
    const item = buildItem(PRODUCT_ID, 5, 10); // requests 5 units
    prismaMock.cartGroup.findFirst.mockResolvedValue(
      buildCart([buildProvider(PROVIDER_ID, [item])]),
    );

    prismaMock.user.findMany.mockResolvedValue([
      {
        id: PROVIDER_ID,
        latitude: 40.41,
        longitude: -3.7,
        providerServiceRadiusKm: 10,
      },
    ]);

    const txMock = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      product: {
        // Only 3 in stock, 5 requested
        findMany: jest.fn().mockResolvedValue([{ id: PRODUCT_ID, stock: 3 }]),
      },
      stockReservation: { groupBy: jest.fn().mockResolvedValue([]) },
      order: { create: jest.fn() },
      orderSummaryDocument: { create: jest.fn() },
      cartGroup: { update: jest.fn() },
    };
    prismaMock.$transaction.mockImplementation((cb: any) => cb(txMock));

    await expect(
      service.checkoutFromCart(CLIENT_ID, validCheckoutDto as any, 'idem-4'),
    ).rejects.toThrow(ConflictException);
  });

  // ─── Test 4: happy path ───────────────────────────────────────────────────

  it('crea orden correctamente y retorna el pedido con reservas activas', async () => {
    const items = [buildItem(PRODUCT_ID, 2, 10)];
    setupHappyPath(items);

    const result = await service.checkoutFromCart(
      CLIENT_ID,
      validCheckoutDto as any,
      'idem-happy',
    );

    expect(result).toHaveProperty('id', ORDER_ID);
    expect(result).toHaveProperty('providerOrders');
    expect((result as any).providerOrders).toHaveLength(1);
    // reservationExpiresAt is set by toReservationAwareOrder()
    expect((result as any).providerOrders[0]).toHaveProperty(
      'reservationExpiresAt',
    );
  });

  // ─── Test 5: Money.of() para calcular precios ────────────────────────────

  it('usa Money.of() para calcular el totalPrice de la orden', async () => {
    // Two items: 2×10 = 20 EUR total
    const items = [buildItem(PRODUCT_ID, 2, 10)];
    const txMock = setupHappyPath(items);

    await service.checkoutFromCart(
      CLIENT_ID,
      validCheckoutDto as any,
      'idem-money',
    );

    // Verify that order.create was called with the correct totalPrice
    // Money.of(20).amount === 20 (2 × price 10)
    const createCall = txMock.order.create.mock.calls[0][0];
    expect(createCall.data).toHaveProperty('totalPrice', 20);
  });

  // ─── Test 6: agrupa items por proveedor ──────────────────────────────────

  it('agrupa items por proveedor correctamente en providerOrders.create', async () => {
    const PROVIDER_B = 'provider-2';
    const PRODUCT_B = 'prod-2';

    prismaMock.order.findUnique.mockResolvedValue(null);

    const itemsA = [buildItem(PRODUCT_ID, 1, 10)];
    const itemsB = [buildItem(PRODUCT_B, 2, 5)];
    const providerA = buildProvider(PROVIDER_ID, itemsA);
    const providerB = buildProvider(PROVIDER_B, itemsB);

    prismaMock.cartGroup.findFirst.mockResolvedValue(
      buildCart([providerA, providerB]),
    );

    prismaMock.user.findMany.mockResolvedValue([
      {
        id: PROVIDER_ID,
        latitude: 40.41,
        longitude: -3.7,
        providerServiceRadiusKm: 10,
      },
      {
        id: PROVIDER_B,
        latitude: 40.42,
        longitude: -3.71,
        providerServiceRadiusKm: 10,
      },
    ]);

    const txMock = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      product: {
        findMany: jest.fn().mockResolvedValue([
          { id: PRODUCT_ID, stock: 5 },
          { id: PRODUCT_B, stock: 5 },
        ]),
      },
      stockReservation: { groupBy: jest.fn().mockResolvedValue([]) },
      order: {
        create: jest.fn().mockResolvedValue({
          id: ORDER_ID,
          clientId: CLIENT_ID,
          status: DeliveryStatus.PENDING,
          providerOrders: [
            {
              id: 'po-a',
              providerId: PROVIDER_ID,
              items: [{ productId: PRODUCT_ID, quantity: 1 }],
            },
            {
              id: 'po-b',
              providerId: PROVIDER_B,
              items: [{ productId: PRODUCT_B, quantity: 2 }],
            },
          ],
        }),
      },
      orderSummaryDocument: { create: jest.fn().mockResolvedValue({}) },
      cartGroup: { update: jest.fn().mockResolvedValue({}) },
    };

    prismaMock.$transaction.mockImplementation((cb: any) => cb(txMock));
    prismaMock.stockReservation.createMany.mockResolvedValue({ count: 2 });
    prismaMock.order.findUniqueOrThrow.mockResolvedValue({
      id: ORDER_ID,
      summaryDocument: null,
      providerOrders: [
        {
          id: 'po-a',
          providerId: PROVIDER_ID,
          items: [{ productId: PRODUCT_ID, quantity: 1 }],
          reservations: [{ expiresAt: new Date(Date.now() + 900000) }],
        },
        {
          id: 'po-b',
          providerId: PROVIDER_B,
          items: [{ productId: PRODUCT_B, quantity: 2 }],
          reservations: [{ expiresAt: new Date(Date.now() + 900000) }],
        },
      ],
    });

    await service.checkoutFromCart(
      CLIENT_ID,
      validCheckoutDto as any,
      'idem-multivendor',
    );

    // order.create should have been called with two providerOrders, one per provider
    const createCall = txMock.order.create.mock.calls[0][0];
    const createdProviderOrders = createCall.data.providerOrders.create;
    expect(createdProviderOrders).toHaveLength(2);
    const providerIds = createdProviderOrders.map((po: any) => po.providerId);
    expect(providerIds).toContain(PROVIDER_ID);
    expect(providerIds).toContain(PROVIDER_B);
  });

  // ─── Test 7: reserva stock antes de crear la sesión ──────────────────────

  it('reserva stock antes de crear la sesión de pago', async () => {
    const items = [buildItem(PRODUCT_ID, 1, 10)];
    setupHappyPath(items);

    await service.checkoutFromCart(
      CLIENT_ID,
      validCheckoutDto as any,
      'idem-stock-order',
    );

    // stockReservation.createMany must be called before order.findUniqueOrThrow
    // (which is the initiatePaymentSession step)
    const createManyCallOrder =
      prismaMock.stockReservation.createMany.mock.invocationCallOrder[0];
    const findUniqueOrThrowCallOrder =
      prismaMock.order.findUniqueOrThrow.mock.invocationCallOrder[0];

    expect(createManyCallOrder).toBeLessThan(findUniqueOrThrowCallOrder);
  });
});
