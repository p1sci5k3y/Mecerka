import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  DeliveryStatus,
  PaymentSessionStatus,
  ProviderOrderStatus,
  ProviderPaymentStatus,
  Role,
} from '@prisma/client';
import { ConflictException } from '@nestjs/common';

describe('OrdersService (Lifecycle Transitions & RBAC)', () => {
  let service: OrdersService;
  let prismaMock: any;
  let eventEmitterMock: any;

  beforeEach(async () => {
    prismaMock = {
      order: {
        findUnique: jest.fn(),
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
      },
      $transaction: jest.fn(),
    };
    eventEmitterMock = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: EventEmitter2, useValue: eventEmitterMock },
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

  describe('Checkout idempotency', () => {
    it('fails checkout when the idempotency key header is missing', async () => {
      await expect(service.checkoutFromCart('client-1')).rejects.toThrow(
        'Idempotency-Key header is required',
      );
    });

    it('fails checkout when the active cart is empty', async () => {
      prismaMock.order.findUnique.mockResolvedValue(null);
      prismaMock.cartGroup.findFirst.mockResolvedValue({
        id: 'cart-1',
        clientId: 'client-1',
        cityId: 'city-1',
        status: 'ACTIVE',
        providers: [],
      });

      await expect(
        service.checkoutFromCart('client-1', 'idem-empty'),
      ).rejects.toThrow('Active cart is empty');
    });

    it('returns the existing order when the same checkout key is retried', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        id: 'ord-existing',
        clientId: 'client-1',
        checkoutIdempotencyKey: 'idem-1',
        providerOrders: [],
      });

      const result = await service.checkoutFromCart('client-1', 'idem-1');

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

      const result = await service.checkoutFromCart('client-1', 'idem-race');

      expect(result).toEqual(
        expect.objectContaining({
          id: 'ord-race',
          checkoutIdempotencyKey: 'idem-race',
        }),
      );
    });

    it('creates one provider order per cart provider and keeps root order payment fields empty', async () => {
      prismaMock.order.findUnique.mockResolvedValue(null);
      prismaMock.cartGroup.findFirst.mockResolvedValue({
        id: 'cart-1',
        clientId: 'client-1',
        cityId: 'city-1',
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
          {
            providerId: 'provider-2',
            subtotalAmount: 20,
            items: [
              {
                productId: 'product-2',
                quantity: 1,
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
            reservations: [{ expiresAt: new Date('2026-03-15T12:15:00.000Z') }],
            items: [
              { productId: 'product-2', quantity: 1, priceAtPurchase: 20 },
            ],
          },
        ],
      });
      const transactionReservationCreateMany = jest
        .fn()
        .mockResolvedValue({ count: 2 });
      const transactionSummaryCreate = jest.fn().mockResolvedValue({
        id: 'summary-1',
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
            createMany: transactionReservationCreateMany,
          },
          order: {
            create: transactionOrderCreate,
            findUniqueOrThrow: transactionFindUniqueOrThrow,
          },
          orderSummaryDocument: {
            create: transactionSummaryCreate,
          },
          cartGroup: {
            update: jest.fn().mockResolvedValue({}),
          },
        }),
      );

      const result = await service.checkoutFromCart('client-1', 'idem-new');

      expect(transactionOrderCreate).toHaveBeenCalledWith({
        data: {
          clientId: 'client-1',
          cityId: 'city-1',
          totalPrice: 45,
          status: DeliveryStatus.PENDING,
          checkoutIdempotencyKey: 'idem-new',
          providerOrders: {
            create: [
              {
                providerId: 'provider-1',
                status: ProviderOrderStatus.PENDING,
                subtotalAmount: 25,
                paymentStatus: 'PENDING',
                items: {
                  create: [
                    {
                      productId: 'product-1',
                      quantity: 2,
                      priceAtPurchase: 12.5,
                    },
                  ],
                },
              },
              {
                providerId: 'provider-2',
                status: ProviderOrderStatus.PENDING,
                subtotalAmount: 20,
                paymentStatus: 'PENDING',
                items: {
                  create: [
                    {
                      productId: 'product-2',
                      quantity: 1,
                      priceAtPurchase: 20,
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
      expect(
        (result.summaryDocument as any).externalInvoiceNumber,
      ).toBeUndefined();
      expect(result.providerOrders[0].items[0]).toEqual(
        expect.objectContaining({
          productId: 'product-1',
          quantity: 2,
          priceAtPurchase: 12.5,
        }),
      );
      expect(result.providerOrders[0].reservationExpiresAt).toEqual(
        new Date('2026-03-15T12:15:00.000Z'),
      );
      expect(result.paymentRef).toBeNull();
    });

    it('fails checkout with STOCK_UNAVAILABLE when active reservations exhaust stock', async () => {
      prismaMock.order.findUnique.mockResolvedValue(null);
      prismaMock.cartGroup.findFirst.mockResolvedValue({
        id: 'cart-1',
        clientId: 'client-1',
        cityId: 'city-1',
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
        service.checkoutFromCart('client-1', 'idem-stock'),
      ).rejects.toThrow('STOCK_UNAVAILABLE');
    });

    it('locks checkout products in deterministic sorted order', async () => {
      prismaMock.order.findUnique.mockResolvedValue(null);
      prismaMock.cartGroup.findFirst.mockResolvedValue({
        id: 'cart-1',
        clientId: 'client-1',
        cityId: 'city-1',
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
            createMany: jest.fn().mockResolvedValue({ count: 2 }),
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
            findUniqueOrThrow: jest.fn().mockResolvedValue({
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
                  reservations: [
                    { expiresAt: new Date('2026-03-15T12:15:00.000Z') },
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

      await service.checkoutFromCart('client-1', 'idem-lock-order');

      const sql = executeRaw.mock.calls[0]?.[0];
      expect(sql.values).toEqual(['product-a', 'product-b']);
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
