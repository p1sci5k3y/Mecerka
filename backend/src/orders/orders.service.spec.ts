import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { OrderItemsService } from './order-items.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GEOCODING_SERVICE } from '../geocoding/geocoding.constants';
import {
  DeliveryStatus,
  PaymentSessionStatus,
  ProviderOrderStatus,
  ProviderPaymentStatus,
  Role,
} from '@prisma/client';
import { ConflictException, ForbiddenException } from '@nestjs/common';

describe('OrdersService (Lifecycle Transitions & RBAC)', () => {
  let service: OrdersService;
  let prismaMock: any;
  let eventEmitterMock: any;
  let geocodingServiceMock: any;
  const validCheckoutDto = {
    cityId: 'city-1',
    deliveryAddress: 'Calle Mayor 1',
    postalCode: '28013',
    addressReference: 'Portal 2',
    discoveryRadiusKm: 6,
  };

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
      orderSummaryDocument: {
        create: jest.fn(),
      },
      cartGroup: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      stockReservation: {
        findMany: jest.fn(),
        createMany: jest.fn(),
      },
      product: {
        findMany: jest.fn(),
      },
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
    eventEmitterMock = {
      emit: jest.fn(),
    };
    geocodingServiceMock = {
      geocodeAddress: jest.fn().mockResolvedValue({
        latitude: 40.4168,
        longitude: -3.7038,
        formattedAddress: 'Calle Mayor 1, 28013 Madrid, Spain',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: EventEmitter2, useValue: eventEmitterMock },
        { provide: GEOCODING_SERVICE, useValue: geocodingServiceMock },
        {
          provide: OrderItemsService,
          useValue: {
            getProviderStats: jest.fn(),
            getProviderSalesChart: jest.fn(),
            getProviderTopProducts: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('IN_TRANSIT Enforcement', () => {
    it('Should throw 409 (ConflictException) if Runner tries to mark IN_TRANSIT but ProviderOrder is not PICKED_UP', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        id: 'ord-123',
        runnerId: 'runner-123',
        status: DeliveryStatus.ASSIGNED,
        providerOrders: [
          { id: 'po-1', status: ProviderOrderStatus.PICKED_UP },
          { id: 'po-2', status: ProviderOrderStatus.READY_FOR_PICKUP }, // <--- Faltante
        ],
      });

      await expect(
        service.markInTransit('ord-123', 'runner-123'),
      ).rejects.toThrow(ConflictException);
    });

    it('Should mark IN_TRANSIT (200 OK logic) if Runner is correct and all active ProviderOrders are PICKED_UP', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        id: 'ord-123',
        runnerId: 'runner-123',
        status: DeliveryStatus.ASSIGNED,
        providerOrders: [
          { id: 'po-1', status: ProviderOrderStatus.PICKED_UP },
          { id: 'po-2', status: ProviderOrderStatus.REJECTED_BY_STORE }, // Ignore this one
        ],
      });
      prismaMock.order.update.mockResolvedValue({
        id: 'ord-123',
        status: DeliveryStatus.IN_TRANSIT,
      });

      const result = await service.markInTransit('ord-123', 'runner-123');

      expect(result.status).toBe(DeliveryStatus.IN_TRANSIT);
      expect(prismaMock.order.update).toHaveBeenCalledWith({
        where: { id: 'ord-123' },
        data: { status: DeliveryStatus.IN_TRANSIT },
      });
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        'order.stateChanged',
        expect.any(Object),
      );
    });
  });

  describe('Order creation guardrails', () => {
    it('rejects multi-provider orders because the payment flow cannot settle them safely', async () => {
      prismaMock.product.findMany.mockResolvedValue([
        {
          id: 'prod-1',
          name: 'Prod A',
          stock: 5,
          isActive: true,
          cityId: 'city-1',
          price: 10,
          providerId: 'provider-a',
          provider: { stripeAccountId: 'acct_a' },
        },
        {
          id: 'prod-2',
          name: 'Prod B',
          stock: 5,
          isActive: true,
          cityId: 'city-1',
          price: 20,
          providerId: 'provider-b',
          provider: { stripeAccountId: 'acct_b' },
        },
      ]);

      await expect(
        service.create(
          {
            items: [
              { productId: 'prod-1', quantity: 1 },
              { productId: 'prod-2', quantity: 1 },
            ],
            deliveryAddress: 'Main Street 1',
          },
          'client-1',
        ),
      ).rejects.toThrow(
        'El flujo de pago actual solo admite pedidos de un único proveedor.',
      );
    });
  });

  describe('Order tracking', () => {
    it('returns null location before pickup', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        id: 'ord-1',
        clientId: 'client-1',
        runnerId: null,
        status: DeliveryStatus.CONFIRMED,
        providerOrders: [{ providerId: 'provider-1' }],
        deliveryOrder: {
          id: 'delivery-1',
          status: 'PICKUP_PENDING',
          runnerId: 'runner-1',
          lastRunnerLocationLat: 40.4168,
          lastRunnerLocationLng: -3.7038,
          lastLocationUpdateAt: new Date('2026-03-16T10:00:00.000Z'),
          runner: {
            id: 'runner-1',
            name: 'Runner Demo',
          },
        },
      });

      const result = await service.getOrderTracking('ord-1', 'client-1', [
        Role.CLIENT,
      ]);

      expect(result).toEqual({
        orderId: 'ord-1',
        status: 'ASSIGNED',
        runner: {
          id: 'runner-1',
          name: 'Runner Demo',
        },
        location: null,
        updatedAt: new Date('2026-03-16T10:00:00.000Z'),
      });
    });

    it('returns runner location once delivery is in transit', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        id: 'ord-2',
        clientId: 'client-1',
        runnerId: 'runner-1',
        status: DeliveryStatus.IN_TRANSIT,
        providerOrders: [{ providerId: 'provider-1' }],
        deliveryOrder: {
          id: 'delivery-2',
          status: 'IN_TRANSIT',
          runnerId: 'runner-1',
          lastRunnerLocationLat: 40.4168123,
          lastRunnerLocationLng: -3.7038456,
          lastLocationUpdateAt: new Date('2026-03-16T10:05:00.000Z'),
          runner: {
            id: 'runner-1',
            name: 'Runner Demo',
          },
        },
      });

      const result = await service.getOrderTracking('ord-2', 'client-1', [
        Role.CLIENT,
      ]);

      expect(result).toEqual({
        orderId: 'ord-2',
        status: 'DELIVERING',
        runner: {
          id: 'runner-1',
          name: 'Runner Demo',
        },
        location: {
          lat: 40.417,
          lng: -3.704,
        },
        updatedAt: new Date('2026-03-16T10:05:00.000Z'),
      });
    });

    it('rejects tracking access for unrelated users', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        id: 'ord-3',
        clientId: 'client-1',
        runnerId: 'runner-1',
        status: DeliveryStatus.IN_TRANSIT,
        providerOrders: [{ providerId: 'provider-1' }],
        deliveryOrder: {
          id: 'delivery-3',
          status: 'IN_TRANSIT',
          runnerId: 'runner-1',
          lastRunnerLocationLat: 40.4168,
          lastRunnerLocationLng: -3.7038,
          lastLocationUpdateAt: new Date('2026-03-16T10:05:00.000Z'),
          runner: {
            id: 'runner-1',
            name: 'Runner Demo',
          },
        },
      });

      await expect(
        service.getOrderTracking('ord-3', 'user-other', [Role.CLIENT]),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Checkout idempotency', () => {
    it('fails checkout when the idempotency key header is missing', async () => {
      await expect(
        service.checkoutFromCart('client-1', validCheckoutDto as any),
      ).rejects.toThrow('Idempotency-Key header is required');
    });

    it('fails checkout when the active cart is empty', async () => {
      prismaMock.order.findUnique.mockResolvedValue(null);
      prismaMock.cartGroup.findFirst.mockResolvedValue({
        id: 'cart-1',
        clientId: 'client-1',
        cityId: 'city-1',
        city: {
          id: 'city-1',
          name: 'Madrid',
          active: true,
          maxDeliveryRadiusKm: 8,
          baseDeliveryFee: 3.5,
          deliveryPerKmFee: 0.9,
          extraPickupFee: 1.5,
        },
        status: 'ACTIVE',
        providers: [],
      });

      await expect(
        service.checkoutFromCart(
          'client-1',
          validCheckoutDto as any,
          'idem-empty',
        ),
      ).rejects.toThrow('Active cart is empty');
    });

    it('returns the existing order when the same checkout key is retried', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        id: 'ord-existing',
        clientId: 'client-1',
        checkoutIdempotencyKey: 'idem-1',
        providerOrders: [],
      });

      const result = await service.checkoutFromCart(
        'client-1',
        validCheckoutDto as any,
        'idem-1',
      );

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(result).toEqual(
        expect.objectContaining({
          id: 'ord-existing',
          checkoutIdempotencyKey: 'idem-1',
        }),
      );
    });

    it('returns the same order when a concurrent checkout collides on the unique idempotency key', async () => {
      prismaMock.order.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'ord-race',
          clientId: 'client-1',
          checkoutIdempotencyKey: 'idem-race',
          providerOrders: [],
        });
      prismaMock.cartGroup.findFirst.mockResolvedValue({
        id: 'cart-1',
        clientId: 'client-1',
        cityId: 'city-1',
        city: {
          id: 'city-1',
          name: 'Madrid',
          active: true,
          maxDeliveryRadiusKm: 8,
        },
        status: 'ACTIVE',
        providers: [
          {
            providerId: 'provider-1',
            subtotalAmount: 25,
            items: [
              {
                productId: 'product-1',
                quantity: 2,
                unitPriceSnapshot: 12.5,
                discountPriceSnapshot: null,
                effectiveUnitPriceSnapshot: 12.5,
              },
            ],
          },
        ],
      });
      prismaMock.user.findMany.mockResolvedValue([
        {
          id: 'provider-1',
          latitude: 40.417,
          longitude: -3.704,
          providerServiceRadiusKm: 8,
        },
      ]);
      prismaMock.$transaction.mockImplementation(async (callback: any) =>
        callback({
          $executeRaw: jest.fn(),
          product: {
            findMany: jest
              .fn()
              .mockResolvedValue([{ id: 'product-1', stock: 10 }]),
          },
          stockReservation: {
            groupBy: jest.fn().mockResolvedValue([]),
          },
          order: {
            create: jest.fn().mockRejectedValue({ code: 'P2002' }),
          },
          cartGroup: {
            update: jest.fn(),
          },
        }),
      );

      const result = await service.checkoutFromCart(
        'client-1',
        validCheckoutDto as any,
        'idem-race',
      );

      expect(result).toEqual(
        expect.objectContaining({
          id: 'ord-race',
          checkoutIdempotencyKey: 'idem-race',
        }),
      );
    });

    it('creates one provider order per cart provider and persists geocoded coverage fields', async () => {
      prismaMock.order.findUnique.mockResolvedValue(null);
      prismaMock.cartGroup.findFirst.mockResolvedValue({
        id: 'cart-1',
        clientId: 'client-1',
        cityId: 'city-1',
        city: {
          id: 'city-1',
          name: 'Madrid',
          active: true,
          maxDeliveryRadiusKm: 8,
        },
        status: 'ACTIVE',
        providers: [
          {
            providerId: 'provider-1',
            subtotalAmount: 25,
            items: [
              {
                productId: 'product-1',
                quantity: 2,
                unitPriceSnapshot: 12.5,
                discountPriceSnapshot: null,
                effectiveUnitPriceSnapshot: 12.5,
              },
            ],
          },
          {
            providerId: 'provider-2',
            subtotalAmount: 20,
            items: [
              {
                productId: 'product-2',
                quantity: 1,
                unitPriceSnapshot: 20,
                discountPriceSnapshot: null,
                effectiveUnitPriceSnapshot: 20,
              },
            ],
          },
        ],
      });

      const transactionOrderCreate = jest.fn().mockResolvedValue({
        id: 'ord-new',
        clientId: 'client-1',
        checkoutIdempotencyKey: 'idem-new',
        paymentRef: null,
        providerOrders: [
          {
            id: 'po-1',
            providerId: 'provider-1',
            subtotalAmount: 25,
            paymentStatus: 'PENDING',
            deliveryDistanceKm: 0.03,
            coverageLimitKm: 6,
            reservations: [{ expiresAt: new Date('2026-03-15T12:15:00.000Z') }],
            items: [
              { productId: 'product-1', quantity: 2, priceAtPurchase: 12.5 },
            ],
          },
          {
            id: 'po-2',
            providerId: 'provider-2',
            subtotalAmount: 20,
            paymentStatus: 'PENDING',
            deliveryDistanceKm: 0.17,
            coverageLimitKm: 6,
            reservations: [{ expiresAt: new Date('2026-03-15T12:15:00.000Z') }],
            items: [
              { productId: 'product-2', quantity: 1, priceAtPurchase: 20 },
            ],
          },
        ],
      });
      const transactionFindUniqueOrThrow = jest.fn().mockResolvedValue({
        id: 'ord-new',
        clientId: 'client-1',
        paymentRef: null,
        deliveryFee: 5.15,
        deliveryDistanceKm: 0.17,
        runnerBaseFee: 3.5,
        runnerPerKmFee: 0.9,
        runnerExtraPickupFee: 1.5,
        postalCode: '28013',
        addressReference: 'Portal 2',
        discoveryRadiusKm: 6,
        summaryDocument: {
          id: 'summary-1',
          orderId: 'ord-new',
          displayNumber: 'SUM-ORD-NEW',
          totalAmount: 45,
          currency: 'EUR',
        },
        providerOrders: [
          {
            id: 'po-1',
            providerId: 'provider-1',
            subtotalAmount: 25,
            paymentStatus: 'PENDING',
            deliveryDistanceKm: 0.03,
            coverageLimitKm: 6,
            reservations: [{ expiresAt: new Date('2026-03-15T12:15:00.000Z') }],
            items: [
              { productId: 'product-1', quantity: 2, priceAtPurchase: 12.5 },
            ],
          },
          {
            id: 'po-2',
            providerId: 'provider-2',
            subtotalAmount: 20,
            paymentStatus: 'PENDING',
            deliveryDistanceKm: 0.17,
            coverageLimitKm: 6,
            reservations: [{ expiresAt: new Date('2026-03-15T12:15:00.000Z') }],
            items: [
              { productId: 'product-2', quantity: 1, priceAtPurchase: 20 },
            ],
          },
        ],
      });
      const transactionSummaryCreate = jest.fn().mockResolvedValue({
        id: 'summary-1',
      });

      prismaMock.user.findMany.mockResolvedValue([
        {
          id: 'provider-1',
          latitude: 40.417,
          longitude: -3.704,
          providerServiceRadiusKm: 8,
        },
        {
          id: 'provider-2',
          latitude: 40.418,
          longitude: -3.705,
          providerServiceRadiusKm: 8,
        },
      ]);
      prismaMock.order.findUniqueOrThrow.mockImplementation(
        transactionFindUniqueOrThrow,
      );
      prismaMock.$transaction.mockImplementation(async (callback: any) =>
        callback({
          $executeRaw: jest.fn(),
          product: {
            findMany: jest.fn().mockResolvedValue([
              { id: 'product-1', stock: 5 },
              { id: 'product-2', stock: 5 },
            ]),
          },
          stockReservation: {
            groupBy: jest.fn().mockResolvedValue([]),
          },
          order: {
            create: transactionOrderCreate,
          },
          orderSummaryDocument: {
            create: transactionSummaryCreate,
          },
          cartGroup: {
            update: jest.fn().mockResolvedValue({}),
          },
        }),
      );

      const result = await service.checkoutFromCart(
        'client-1',
        validCheckoutDto as any,
        'idem-new',
      );

      expect(transactionOrderCreate).toHaveBeenCalledWith({
        data: {
          clientId: 'client-1',
          cityId: 'city-1',
          totalPrice: 45,
          deliveryFee: 5.15,
          deliveryDistanceKm: 0.17,
          status: DeliveryStatus.PENDING,
          checkoutIdempotencyKey: 'idem-new',
          deliveryAddress: 'Calle Mayor 1',
          postalCode: '28013',
          addressReference: 'Portal 2',
          deliveryLat: 40.4168,
          deliveryLng: -3.7038,
          discoveryRadiusKm: 6,
          runnerBaseFee: 3.5,
          runnerPerKmFee: 0.9,
          runnerExtraPickupFee: 1.5,
          providerOrders: {
            create: [
              {
                providerId: 'provider-1',
                status: ProviderOrderStatus.PENDING,
                subtotalAmount: 25,
                paymentStatus: 'PENDING',
                deliveryDistanceKm: 0.03,
                coverageLimitKm: 6,
                items: {
                  create: [
                    {
                      productId: 'product-1',
                      quantity: 2,
                      priceAtPurchase: 12.5,
                      unitBasePriceSnapshot: 12.5,
                      discountPriceSnapshot: null,
                    },
                  ],
                },
              },
              {
                providerId: 'provider-2',
                status: ProviderOrderStatus.PENDING,
                subtotalAmount: 20,
                paymentStatus: 'PENDING',
                deliveryDistanceKm: 0.17,
                coverageLimitKm: 6,
                items: {
                  create: [
                    {
                      productId: 'product-2',
                      quantity: 1,
                      priceAtPurchase: 20,
                      unitBasePriceSnapshot: 20,
                      discountPriceSnapshot: null,
                    },
                  ],
                },
              },
            ],
          },
        },
        include: {
          providerOrders: {
            include: {
              items: true,
            },
          },
        },
      });
      expect(transactionSummaryCreate).toHaveBeenCalledWith({
        data: {
          orderId: 'ord-new',
          displayNumber: 'SUM-ORD-NEW',
          totalAmount: 45,
          currency: 'EUR',
        },
      });
      expect(result.providerOrders).toHaveLength(2);
      expect(result.summaryDocument).toEqual(
        expect.objectContaining({
          orderId: 'ord-new',
          displayNumber: 'SUM-ORD-NEW',
          totalAmount: 45,
          currency: 'EUR',
        }),
      );
      expect(result.deliveryFee).toBe(5.15);
      expect(result.deliveryDistanceKm).toBe(0.17);
      expect(result.runnerBaseFee).toBe(3.5);
      expect(result.runnerPerKmFee).toBe(0.9);
      expect(result.runnerExtraPickupFee).toBe(1.5);
      expect(result.postalCode).toBe('28013');
      expect(result.providerOrders[0].deliveryDistanceKm).toBe(0.03);
      expect(result.providerOrders[0].coverageLimitKm).toBe(6);
      expect(result.providerOrders[0].reservationExpiresAt).toEqual(
        new Date('2026-03-15T12:15:00.000Z'),
      );
      expect(result.paymentRef).toBeNull();
    });

    it('calculates a lower delivery fee for a single-provider order than for a multi-provider order in the same city', async () => {
      prismaMock.order.findUnique.mockResolvedValue(null);
      prismaMock.cartGroup.findFirst.mockResolvedValue({
        id: 'cart-1',
        clientId: 'client-1',
        cityId: 'city-1',
        city: {
          id: 'city-1',
          name: 'Madrid',
          active: true,
          maxDeliveryRadiusKm: 8,
          baseDeliveryFee: 3.5,
          deliveryPerKmFee: 0.9,
          extraPickupFee: 1.5,
        },
        status: 'ACTIVE',
        providers: [
          {
            providerId: 'provider-1',
            subtotalAmount: 25,
            items: [
              {
                productId: 'product-1',
                quantity: 1,
                unitPriceSnapshot: 25,
                discountPriceSnapshot: null,
                effectiveUnitPriceSnapshot: 25,
              },
            ],
          },
        ],
      });

      const transactionOrderCreate = jest.fn().mockResolvedValue({
        id: 'ord-single',
        deliveryFee: 3.53,
        deliveryDistanceKm: 0.03,
        runnerBaseFee: 3.5,
        runnerPerKmFee: 0.9,
        runnerExtraPickupFee: 1.5,
        providerOrders: [
          {
            id: 'po-1',
            providerId: 'provider-1',
            subtotalAmount: 25,
            paymentStatus: 'PENDING',
            deliveryDistanceKm: 0.03,
            coverageLimitKm: 6,
            reservations: [{ expiresAt: new Date('2026-03-15T12:15:00.000Z') }],
            items: [
              { productId: 'product-1', quantity: 1, priceAtPurchase: 25 },
            ],
          },
        ],
      });

      prismaMock.user.findMany.mockResolvedValue([
        {
          id: 'provider-1',
          latitude: 40.417,
          longitude: -3.704,
          providerServiceRadiusKm: 8,
        },
      ]);
      prismaMock.order.findUniqueOrThrow.mockResolvedValue({
        id: 'ord-single',
        deliveryFee: 3.53,
        deliveryDistanceKm: 0.03,
        runnerBaseFee: 3.5,
        runnerPerKmFee: 0.9,
        runnerExtraPickupFee: 1.5,
        providerOrders: [
          {
            id: 'po-1',
            providerId: 'provider-1',
            subtotalAmount: 25,
            paymentStatus: 'PENDING',
            deliveryDistanceKm: 0.03,
            coverageLimitKm: 6,
            reservations: [{ expiresAt: new Date('2026-03-15T12:15:00.000Z') }],
            items: [
              {
                productId: 'product-1',
                quantity: 1,
                priceAtPurchase: 25,
              },
            ],
          },
        ],
      });
      prismaMock.$transaction.mockImplementation(async (callback: any) =>
        callback({
          $executeRaw: jest.fn(),
          product: {
            findMany: jest
              .fn()
              .mockResolvedValue([{ id: 'product-1', stock: 5 }]),
          },
          stockReservation: {
            groupBy: jest.fn().mockResolvedValue([]),
          },
          order: {
            create: transactionOrderCreate,
          },
          orderSummaryDocument: {
            create: jest.fn().mockResolvedValue({ id: 'summary-1' }),
          },
          cartGroup: {
            update: jest.fn().mockResolvedValue({}),
          },
        }),
      );

      const result = await service.checkoutFromCart(
        'client-1',
        validCheckoutDto as any,
        'idem-single',
      );

      expect(result.deliveryFee).toBe(3.53);
      expect(result.deliveryDistanceKm).toBe(0.03);
    });

    it('increases the delivery fee when distance and additional pickups grow', async () => {
      prismaMock.order.findUnique.mockResolvedValue(null);
      prismaMock.cartGroup.findFirst.mockResolvedValue({
        id: 'cart-1',
        clientId: 'client-1',
        cityId: 'city-1',
        city: {
          id: 'city-1',
          name: 'Madrid',
          active: true,
          maxDeliveryRadiusKm: 8,
          baseDeliveryFee: 2,
          deliveryPerKmFee: 1,
          extraPickupFee: 1.25,
        },
        status: 'ACTIVE',
        providers: [
          {
            providerId: 'provider-1',
            subtotalAmount: 10,
            items: [
              {
                productId: 'product-1',
                quantity: 1,
                effectiveUnitPriceSnapshot: 10,
              },
            ],
          },
          {
            providerId: 'provider-2',
            subtotalAmount: 12,
            items: [
              {
                productId: 'product-2',
                quantity: 1,
                effectiveUnitPriceSnapshot: 12,
              },
            ],
          },
        ],
      });

      prismaMock.user.findMany.mockResolvedValue([
        {
          id: 'provider-1',
          latitude: 40.417,
          longitude: -3.704,
          providerServiceRadiusKm: 8,
        },
        {
          id: 'provider-2',
          latitude: 40.4205,
          longitude: -3.711,
          providerServiceRadiusKm: 8,
        },
      ]);
      prismaMock.order.findUniqueOrThrow.mockResolvedValue({
        id: 'ord-pricing',
        deliveryFee: 3.8,
        deliveryDistanceKm: 0.55,
        runnerBaseFee: 2,
        runnerPerKmFee: 1,
        runnerExtraPickupFee: 1.25,
        providerOrders: [
          {
            id: 'po-1',
            providerId: 'provider-1',
            subtotalAmount: 10,
            paymentStatus: 'PENDING',
            deliveryDistanceKm: 0.03,
            coverageLimitKm: 6,
            reservations: [{ expiresAt: new Date('2026-03-15T12:15:00.000Z') }],
            items: [
              { productId: 'product-1', quantity: 1, priceAtPurchase: 10 },
            ],
          },
          {
            id: 'po-2',
            providerId: 'provider-2',
            subtotalAmount: 12,
            paymentStatus: 'PENDING',
            deliveryDistanceKm: 0.55,
            coverageLimitKm: 6,
            reservations: [{ expiresAt: new Date('2026-03-15T12:15:00.000Z') }],
            items: [
              { productId: 'product-2', quantity: 1, priceAtPurchase: 12 },
            ],
          },
        ],
      });
      prismaMock.$transaction.mockImplementation(async (callback: any) =>
        callback({
          $executeRaw: jest.fn(),
          product: {
            findMany: jest.fn().mockResolvedValue([
              { id: 'product-1', stock: 5 },
              { id: 'product-2', stock: 5 },
            ]),
          },
          stockReservation: {
            groupBy: jest.fn().mockResolvedValue([]),
          },
          order: {
            create: jest.fn().mockResolvedValue({
              id: 'ord-pricing',
              deliveryFee: 3.8,
              deliveryDistanceKm: 0.55,
              runnerBaseFee: 2,
              runnerPerKmFee: 1,
              runnerExtraPickupFee: 1.25,
              providerOrders: [
                {
                  id: 'po-1',
                  providerId: 'provider-1',
                  subtotalAmount: 10,
                  paymentStatus: 'PENDING',
                  deliveryDistanceKm: 0.03,
                  coverageLimitKm: 6,
                  reservations: [
                    { expiresAt: new Date('2026-03-15T12:15:00.000Z') },
                  ],
                  items: [
                    {
                      productId: 'product-1',
                      quantity: 1,
                      priceAtPurchase: 10,
                    },
                  ],
                },
                {
                  id: 'po-2',
                  providerId: 'provider-2',
                  subtotalAmount: 12,
                  paymentStatus: 'PENDING',
                  deliveryDistanceKm: 0.55,
                  coverageLimitKm: 6,
                  reservations: [
                    { expiresAt: new Date('2026-03-15T12:15:00.000Z') },
                  ],
                  items: [
                    {
                      productId: 'product-2',
                      quantity: 1,
                      priceAtPurchase: 12,
                    },
                  ],
                },
              ],
            }),
          },
          orderSummaryDocument: {
            create: jest.fn().mockResolvedValue({ id: 'summary-1' }),
          },
          cartGroup: {
            update: jest.fn().mockResolvedValue({}),
          },
        }),
      );

      const result = await service.checkoutFromCart(
        'client-1',
        validCheckoutDto as any,
        'idem-pricing',
      );

      expect(result.deliveryDistanceKm).toBe(0.55);
      expect(result.deliveryFee).toBe(3.8);
      expect(result.runnerBaseFee).toBe(2);
      expect(result.runnerPerKmFee).toBe(1);
      expect(result.runnerExtraPickupFee).toBe(1.25);
    });

    it('fails checkout with STOCK_UNAVAILABLE when active reservations exhaust stock', async () => {
      prismaMock.order.findUnique.mockResolvedValue(null);
      prismaMock.cartGroup.findFirst.mockResolvedValue({
        id: 'cart-1',
        clientId: 'client-1',
        cityId: 'city-1',
        city: {
          id: 'city-1',
          name: 'Madrid',
          active: true,
          maxDeliveryRadiusKm: 8,
          baseDeliveryFee: 3.5,
          deliveryPerKmFee: 0.9,
          extraPickupFee: 1.5,
        },
        status: 'ACTIVE',
        providers: [
          {
            providerId: 'provider-1',
            subtotalAmount: 25,
            items: [
              {
                productId: 'product-1',
                quantity: 2,
                effectiveUnitPriceSnapshot: 12.5,
              },
            ],
          },
        ],
      });
      prismaMock.user.findMany.mockResolvedValue([
        {
          id: 'provider-1',
          latitude: 40.417,
          longitude: -3.704,
          providerServiceRadiusKm: 8,
        },
      ]);
      prismaMock.$transaction.mockImplementation(async (callback: any) =>
        callback({
          $executeRaw: jest.fn(),
          product: {
            findMany: jest
              .fn()
              .mockResolvedValue([{ id: 'product-1', stock: 2 }]),
          },
          stockReservation: {
            groupBy: jest.fn().mockResolvedValue([
              {
                productId: 'product-1',
                _sum: { quantity: 1 },
              },
            ]),
          },
        }),
      );

      await expect(
        service.checkoutFromCart(
          'client-1',
          validCheckoutDto as any,
          'idem-stock',
        ),
      ).rejects.toThrow('STOCK_UNAVAILABLE');
    });

    it('locks checkout products in deterministic sorted order', async () => {
      prismaMock.order.findUnique.mockResolvedValue(null);
      prismaMock.cartGroup.findFirst.mockResolvedValue({
        id: 'cart-1',
        clientId: 'client-1',
        cityId: 'city-1',
        city: {
          id: 'city-1',
          name: 'Madrid',
          active: true,
          maxDeliveryRadiusKm: 8,
          baseDeliveryFee: 3.5,
          deliveryPerKmFee: 0.9,
          extraPickupFee: 1.5,
        },
        status: 'ACTIVE',
        providers: [
          {
            providerId: 'provider-1',
            subtotalAmount: 30,
            items: [
              {
                productId: 'product-b',
                quantity: 1,
                effectiveUnitPriceSnapshot: 10,
              },
              {
                productId: 'product-a',
                quantity: 1,
                effectiveUnitPriceSnapshot: 20,
              },
            ],
          },
        ],
      });

      prismaMock.user.findMany.mockResolvedValue([
        {
          id: 'provider-1',
          latitude: 40.417,
          longitude: -3.704,
          providerServiceRadiusKm: 8,
        },
      ]);
      prismaMock.order.findUniqueOrThrow.mockResolvedValue({
        id: 'ord-new',
        clientId: 'client-1',
        summaryDocument: {
          id: 'summary-1',
          orderId: 'ord-new',
          displayNumber: 'SUM-ORD-NEW',
          totalAmount: 30,
          currency: 'EUR',
        },
        providerOrders: [
          {
            id: 'po-1',
            items: [
              { productId: 'product-b', quantity: 1, priceAtPurchase: 10 },
              { productId: 'product-a', quantity: 1, priceAtPurchase: 20 },
            ],
            reservations: [{ expiresAt: new Date('2026-03-15T12:15:00.000Z') }],
          },
        ],
      });
      const executeRaw = jest.fn();
      prismaMock.$transaction.mockImplementation(async (callback: any) =>
        callback({
          $executeRaw: executeRaw,
          product: {
            findMany: jest.fn().mockResolvedValue([
              { id: 'product-a', stock: 5 },
              { id: 'product-b', stock: 5 },
            ]),
          },
          stockReservation: {
            groupBy: jest.fn().mockResolvedValue([]),
          },
          order: {
            create: jest.fn().mockResolvedValue({
              id: 'ord-new',
              providerOrders: [
                {
                  id: 'po-1',
                  items: [
                    {
                      productId: 'product-b',
                      quantity: 1,
                      priceAtPurchase: 10,
                    },
                    {
                      productId: 'product-a',
                      quantity: 1,
                      priceAtPurchase: 20,
                    },
                  ],
                },
              ],
            }),
          },
          orderSummaryDocument: {
            create: jest.fn().mockResolvedValue({ id: 'summary-1' }),
          },
          cartGroup: {
            update: jest.fn().mockResolvedValue({}),
          },
        }),
      );

      await service.checkoutFromCart(
        'client-1',
        validCheckoutDto as any,
        'idem-lock-order',
      );

      const sql = executeRaw.mock.calls[0]?.[0];
      expect(sql.values).toEqual(['product-a', 'product-b']);
    });

    it('fails checkout when the address cannot be geocoded', async () => {
      prismaMock.order.findUnique.mockResolvedValue(null);
      prismaMock.cartGroup.findFirst.mockResolvedValue({
        id: 'cart-1',
        clientId: 'client-1',
        cityId: 'city-1',
        city: {
          id: 'city-1',
          name: 'Madrid',
          active: true,
          maxDeliveryRadiusKm: 8,
        },
        status: 'ACTIVE',
        providers: [
          {
            providerId: 'provider-1',
            subtotalAmount: 25,
            items: [
              {
                productId: 'product-1',
                quantity: 1,
                effectiveUnitPriceSnapshot: 12.5,
              },
            ],
          },
        ],
      });
      geocodingServiceMock.geocodeAddress.mockResolvedValueOnce(null);

      await expect(
        service.checkoutFromCart(
          'client-1',
          validCheckoutDto as any,
          'idem-geocode',
        ),
      ).rejects.toThrow(
        'Delivery address could not be geocoded for the selected city',
      );
    });

    it('fails checkout when any provider is outside the effective coverage radius', async () => {
      prismaMock.order.findUnique.mockResolvedValue(null);
      prismaMock.cartGroup.findFirst.mockResolvedValue({
        id: 'cart-1',
        clientId: 'client-1',
        cityId: 'city-1',
        city: {
          id: 'city-1',
          name: 'Madrid',
          active: true,
          maxDeliveryRadiusKm: 4,
        },
        status: 'ACTIVE',
        providers: [
          {
            providerId: 'provider-1',
            subtotalAmount: 25,
            items: [
              {
                productId: 'product-1',
                quantity: 1,
                effectiveUnitPriceSnapshot: 12.5,
              },
            ],
          },
        ],
      });
      prismaMock.user.findMany.mockResolvedValue([
        {
          id: 'provider-1',
          latitude: 40.5001,
          longitude: -3.8,
          providerServiceRadiusKm: 6,
        },
      ]);

      await expect(
        service.checkoutFromCart(
          'client-1',
          validCheckoutDto as any,
          'idem-coverage',
        ),
      ).rejects.toThrow(
        'Provider provider-1 is outside the delivery coverage area',
      );
    });
  });

  describe('ProviderOrder payment sessions', () => {
    it('creates a payment session and marks the provider order as payment ready', async () => {
      const transactionCreate = jest.fn().mockResolvedValue({
        id: 'session-1',
        providerOrderId: 'po-1',
        status: PaymentSessionStatus.READY,
        expiresAt: new Date('2026-03-15T12:15:00.000Z'),
      });
      const transactionUpdateSession = jest.fn().mockResolvedValue({
        id: 'session-1',
        providerOrderId: 'po-1',
        paymentProvider: 'internal-mvp',
        paymentUrl: '/provider-orders/po-1/payment-sessions/session-1',
        status: PaymentSessionStatus.READY,
        expiresAt: new Date('2026-03-15T12:15:00.000Z'),
      });
      const transactionUpdateProviderOrder = jest.fn().mockResolvedValue({});

      prismaMock.$transaction.mockImplementation(async (callback: any) =>
        callback({
          $executeRaw: jest.fn(),
          providerOrder: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'po-1',
              status: ProviderOrderStatus.PENDING,
              paymentStatus: ProviderPaymentStatus.PENDING,
              paymentReadyAt: null,
              reservations: [
                { expiresAt: new Date('2026-03-15T12:15:00.000Z') },
              ],
              paymentSessions: [],
            }),
            update: transactionUpdateProviderOrder,
          },
          providerPaymentSession: {
            create: transactionCreate,
            update: transactionUpdateSession,
          },
        }),
      );

      const result = await service.prepareProviderOrderPayment('po-1');

      expect(transactionCreate).toHaveBeenCalledWith({
        data: {
          providerOrderId: 'po-1',
          paymentProvider: 'internal-mvp',
          status: PaymentSessionStatus.READY,
          expiresAt: new Date('2026-03-15T12:15:00.000Z'),
        },
      });
      expect(transactionUpdateProviderOrder).toHaveBeenCalledWith({
        where: { id: 'po-1' },
        data: {
          paymentStatus: ProviderPaymentStatus.PAYMENT_READY,
          paymentReadyAt: expect.any(Date),
          paymentExpiresAt: new Date('2026-03-15T12:15:00.000Z'),
          status: ProviderOrderStatus.PAYMENT_READY,
        },
      });
      expect(result).toEqual(
        expect.objectContaining({
          id: 'session-1',
          paymentUrl: '/provider-orders/po-1/payment-sessions/session-1',
          status: PaymentSessionStatus.READY,
        }),
      );
    });

    it('returns the existing non-expired payment session without creating a new one', async () => {
      const existingSession = {
        id: 'session-existing',
        providerOrderId: 'po-1',
        paymentProvider: 'internal-mvp',
        paymentUrl: '/provider-orders/po-1/payment-sessions/session-existing',
        status: PaymentSessionStatus.READY,
        expiresAt: new Date('2026-03-15T12:15:00.000Z'),
      };
      const transactionUpdateProviderOrder = jest.fn().mockResolvedValue({});
      prismaMock.$transaction.mockImplementation(async (callback: any) =>
        callback({
          $executeRaw: jest.fn(),
          providerOrder: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'po-1',
              status: ProviderOrderStatus.PAYMENT_READY,
              paymentStatus: ProviderPaymentStatus.PENDING,
              paymentReadyAt: null,
              reservations: [
                { expiresAt: new Date('2026-03-15T12:15:00.000Z') },
              ],
              paymentSessions: [existingSession],
            }),
            update: transactionUpdateProviderOrder,
          },
        }),
      );

      const result = await service.prepareProviderOrderPayment('po-1');

      expect(transactionUpdateProviderOrder).toHaveBeenCalledWith({
        where: { id: 'po-1' },
        data: {
          paymentStatus: ProviderPaymentStatus.PAYMENT_READY,
          paymentReadyAt: expect.any(Date),
          paymentExpiresAt: new Date('2026-03-15T12:15:00.000Z'),
          status: ProviderOrderStatus.PAYMENT_READY,
        },
      });
      expect(result).toBe(existingSession);
    });
  });

  describe('Resource authorization', () => {
    it('returns provider list views without leaking global delivery/payment fields', async () => {
      prismaMock.order.findMany.mockResolvedValue([
        {
          id: 'ord-1',
          status: DeliveryStatus.CONFIRMED,
          createdAt: new Date('2026-03-10T10:00:00.000Z'),
          updatedAt: new Date('2026-03-10T10:05:00.000Z'),
          city: { id: 'city-1', name: 'Madrid' },
          clientId: 'client-1',
          runnerId: 'runner-1',
          deliveryAddress: 'Secret street 123',
          deliveryLat: 40.4,
          deliveryLng: -3.7,
          paymentRef: 'pi_secret',
          confirmedAt: new Date('2026-03-10T10:03:00.000Z'),
          providerOrders: [
            {
              id: 'po-provider-1',
              providerId: 'provider-1',
              items: [{ id: 'item-1', product: { id: 'prod-1' } }],
            },
          ],
        },
      ]);

      const result = await service.findAll('provider-1', [Role.PROVIDER]);

      expect(result).toEqual([
        {
          id: 'ord-1',
          status: DeliveryStatus.CONFIRMED,
          createdAt: new Date('2026-03-10T10:00:00.000Z'),
          updatedAt: new Date('2026-03-10T10:05:00.000Z'),
          city: { id: 'city-1', name: 'Madrid' },
          providerOrders: [
            expect.objectContaining({
              id: 'po-provider-1',
              providerId: 'provider-1',
            }),
          ],
        },
      ]);
      expect((result[0] as any).deliveryAddress).toBeUndefined();
      expect((result[0] as any).paymentRef).toBeUndefined();
      expect((result[0] as any).clientId).toBeUndefined();
    });

    it('returns only the provider-owned suborder when a provider views order details', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        id: 'ord-1',
        status: DeliveryStatus.CONFIRMED,
        createdAt: new Date('2026-03-10T10:00:00.000Z'),
        updatedAt: new Date('2026-03-10T10:05:00.000Z'),
        city: { id: 'city-1', name: 'Madrid' },
        clientId: 'client-1',
        runnerId: 'runner-1',
        deliveryAddress: 'Secret street 123',
        paymentRef: 'pi_secret',
        providerOrders: [
          {
            id: 'po-provider-1',
            providerId: 'provider-1',
            items: [{ id: 'item-1', product: { id: 'prod-1' } }],
          },
          {
            id: 'po-provider-2',
            providerId: 'provider-2',
            items: [{ id: 'item-2', product: { id: 'prod-2' } }],
          },
        ],
      });

      const result = await service.findOne('ord-1', 'provider-1', [
        Role.PROVIDER,
      ]);

      expect(result.providerOrders).toEqual([
        expect.objectContaining({
          id: 'po-provider-1',
          providerId: 'provider-1',
        }),
      ]);
      expect((result as any).deliveryAddress).toBeUndefined();
      expect((result as any).paymentRef).toBeUndefined();
      expect((result as any).clientId).toBeUndefined();
      expect((result as any).runnerId).toBeUndefined();
    });
  });

  describe('CANCEL Enforcement', () => {
    it('Should cleanly cancel PENDING order if user is the CLIENT owner (200 OK logic)', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        id: 'ord-123',
        clientId: 'client-123',
        status: DeliveryStatus.PENDING,
        providerOrders: [{ id: 'po-1', status: ProviderOrderStatus.PENDING }],
      });
      prismaMock.$transaction.mockImplementation(async (cb: any) => {
        return { id: 'ord-123', status: DeliveryStatus.CANCELLED };
      });

      const result = await service.cancelOrder('ord-123', 'client-123', [
        Role.CLIENT,
      ]);

      expect(result.status).toBe(DeliveryStatus.CANCELLED);
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        'order.stateChanged',
        expect.objectContaining({
          orderId: 'ord-123',
          newStatus: DeliveryStatus.CANCELLED,
          actorRole: Role.CLIENT,
        }),
      );
    });

    it('Should throw 409 Conflict if CLIENT attempts to cancel a CONFIRMED order', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        id: 'ord-123',
        clientId: 'client-123',
        status: DeliveryStatus.CONFIRMED,
        providerOrders: [],
      });

      await expect(
        service.cancelOrder('ord-123', 'client-123', [Role.CLIENT]),
      ).rejects.toThrow(ConflictException);
    });

    it('Should allow ADMIN to forcefully cancel a CONFIRMED order (200 OK logic)', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        id: 'ord-123',
        clientId: 'client-123',
        status: DeliveryStatus.CONFIRMED,
        providerOrders: [],
      });
      prismaMock.$transaction.mockImplementation(async (cb: any) => {
        return { id: 'ord-123', status: DeliveryStatus.CANCELLED };
      });

      const result = await service.cancelOrder('ord-123', 'admin-999', [
        Role.ADMIN,
      ]);

      expect(result.status).toBe(DeliveryStatus.CANCELLED);
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        'order.stateChanged',
        expect.objectContaining({
          actorRole: Role.ADMIN,
        }),
      );
    });
  });

  describe('Runner acceptance constraints', () => {
    it('rejects a runner with inactive runner profile even if the role token is valid', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        stripeAccountId: 'acct_runner',
        runnerProfile: { isActive: false },
      });

      await expect(service.acceptOrder('ord-1', 'runner-1')).rejects.toThrow(
        'Tu perfil de runner no esta activo para aceptar pedidos.',
      );

      expect(prismaMock.order.findUnique).not.toHaveBeenCalled();
    });
  });
});
