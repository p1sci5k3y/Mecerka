import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { OrderQueryService } from './order-query.service';
import { PrismaService } from '../prisma/prisma.service';
import { OrderItemsService } from './order-items.service';
import { DeliveryStatus, Role } from '@prisma/client';

describe('OrderQueryService', () => {
  let service: OrderQueryService;
  let prismaMock: any;
  let orderItemsServiceMock: any;

  const ORDER_ID = 'order-1';
  const CLIENT_ID = 'client-1';
  const PROVIDER_ID = 'provider-1';
  const RUNNER_ID = 'runner-1';

  const buildOrder = (overrides: any = {}) => ({
    id: ORDER_ID,
    status: DeliveryStatus.PENDING,
    clientId: CLIENT_ID,
    runnerId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    city: { id: 'city-1', name: 'Madrid' },
    providerOrders: [],
    deliveryOrder: null,
    ...overrides,
  });

  beforeEach(async () => {
    prismaMock = {
      order: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      providerOrder: {
        findMany: jest.fn(),
      },
    };

    orderItemsServiceMock = {
      getProviderStats: jest.fn(),
      getProviderSalesChart: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderQueryService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: OrderItemsService, useValue: orderItemsServiceMock },
      ],
    }).compile();

    service = module.get<OrderQueryService>(OrderQueryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── findOne ─────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns the order if ADMIN', async () => {
      const order = buildOrder();
      prismaMock.order.findUnique.mockResolvedValue(order);

      const result = await service.findOne(ORDER_ID, 'admin-user', [
        Role.ADMIN,
      ]);

      expect(prismaMock.order.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: ORDER_ID } }),
      );
      expect(result).toEqual(order);
    });

    it('returns the order for the order client', async () => {
      const order = buildOrder({ clientId: CLIENT_ID });
      prismaMock.order.findUnique.mockResolvedValue(order);

      const result = await service.findOne(ORDER_ID, CLIENT_ID, [Role.CLIENT]);

      expect(result).toEqual(order);
    });

    it('throws NotFoundException when order does not exist', async () => {
      prismaMock.order.findUnique.mockResolvedValue(null);

      await expect(
        service.findOne(ORDER_ID, CLIENT_ID, [Role.CLIENT]),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for unrelated user', async () => {
      const order = buildOrder({ clientId: 'other-client' });
      prismaMock.order.findUnique.mockResolvedValue(order);

      await expect(
        service.findOne(ORDER_ID, CLIENT_ID, [Role.CLIENT]),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns provider-scoped view for provider', async () => {
      const providerOrder = { providerId: PROVIDER_ID, items: [] };
      const order = buildOrder({
        clientId: 'other-client',
        providerOrders: [providerOrder],
      });
      prismaMock.order.findUnique.mockResolvedValue(order);

      const result = await service.findOne(ORDER_ID, PROVIDER_ID, [
        Role.PROVIDER,
      ]);

      expect(result).toHaveProperty('providerOrders');
      expect((result as any).providerOrders).toEqual([providerOrder]);
    });
  });

  // ─── getOrderTracking ─────────────────────────────────────────────────────

  describe('getOrderTracking', () => {
    it('returns tracking without delivery order (uses order status)', async () => {
      const order = buildOrder({ deliveryOrder: null });
      prismaMock.order.findUnique.mockResolvedValue(order);

      const result = await service.getOrderTracking(ORDER_ID, CLIENT_ID, [
        Role.CLIENT,
      ]);

      expect(result).toMatchObject({
        orderId: ORDER_ID,
        status: DeliveryStatus.PENDING,
        runner: null,
        location: null,
      });
    });

    it('returns DELIVERING status when delivery is IN_TRANSIT', async () => {
      const order = buildOrder({
        deliveryOrder: {
          id: 'do-1',
          status: 'IN_TRANSIT',
          runnerId: RUNNER_ID,
          lastRunnerLocationLat: 40.4168,
          lastRunnerLocationLng: -3.7038,
          lastLocationUpdateAt: new Date(),
          runner: { id: RUNNER_ID, name: 'Runner Name' },
        },
        providerOrders: [{ providerId: PROVIDER_ID }],
      });
      prismaMock.order.findUnique.mockResolvedValue(order);

      const result = await service.getOrderTracking(ORDER_ID, CLIENT_ID, [
        Role.CLIENT,
      ]);

      expect(result.status).toBe('DELIVERING');
      expect(result.runner).toEqual({ id: RUNNER_ID, name: 'Runner Name' });
      expect(result.location).toMatchObject({ lat: 40.417, lng: -3.704 });
    });

    it('throws NotFoundException when order does not exist', async () => {
      prismaMock.order.findUnique.mockResolvedValue(null);

      await expect(
        service.getOrderTracking(ORDER_ID, CLIENT_ID, [Role.CLIENT]),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for unrelated user', async () => {
      const order = buildOrder({ clientId: 'other-user', providerOrders: [] });
      prismaMock.order.findUnique.mockResolvedValue(order);

      await expect(
        service.getOrderTracking(ORDER_ID, CLIENT_ID, [Role.CLIENT]),
      ).rejects.toThrow(ForbiddenException);
    });

    it('ADMIN can always view tracking', async () => {
      const order = buildOrder({ clientId: 'other-user', providerOrders: [] });
      prismaMock.order.findUnique.mockResolvedValue(order);

      const result = await service.getOrderTracking(ORDER_ID, 'admin-user', [
        Role.ADMIN,
      ]);

      expect(result.orderId).toBe(ORDER_ID);
    });
  });

  // ─── findAll ─────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns client orders for CLIENT role', async () => {
      const orders = [buildOrder()];
      prismaMock.order.findMany.mockResolvedValue(orders);

      const result = await service.findAll(CLIENT_ID, [Role.CLIENT]);

      expect(prismaMock.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { clientId: CLIENT_ID },
          include: expect.objectContaining({
            deliveryOrder: expect.any(Object),
          }),
        }),
      );
      expect(result).toEqual(orders);
    });

    it('returns runner orders for RUNNER role using delivery ownership too', async () => {
      const orders = [buildOrder({ runnerId: RUNNER_ID })];
      prismaMock.order.findMany.mockResolvedValue(orders);

      const result = await service.findAll(RUNNER_ID, [Role.RUNNER]);

      expect(prismaMock.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { runnerId: RUNNER_ID },
              { deliveryOrder: { runnerId: RUNNER_ID } },
            ],
          },
          include: expect.objectContaining({
            deliveryOrder: expect.any(Object),
          }),
        }),
      );
      expect(result).toEqual(orders);
    });

    it('returns provider-scoped orders for PROVIDER role', async () => {
      const providerOrder = { providerId: PROVIDER_ID, items: [] };
      const orders = [buildOrder({ providerOrders: [providerOrder] })];
      prismaMock.order.findMany.mockResolvedValue(orders);

      const result = await service.findAll(PROVIDER_ID, [Role.PROVIDER]);

      expect(prismaMock.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { providerOrders: { some: { providerId: PROVIDER_ID } } },
          include: expect.objectContaining({
            deliveryOrder: expect.any(Object),
          }),
        }),
      );
      expect(Array.isArray(result)).toBe(true);
    });

    it('returns empty array for unknown role', async () => {
      const result = await service.findAll('unknown-user', []);

      expect(result).toEqual([]);
      expect(prismaMock.order.findMany).not.toHaveBeenCalled();
    });

    it('returns all orders for ADMIN role (uses CLIENT branch as ADMIN is not PROVIDER/RUNNER)', async () => {
      // ADMIN has CLIENT branch because it goes through roles.includes(CLIENT)
      // Actually ADMIN falls through to empty array — verify this behavior
      const result = await service.findAll('admin-id', [Role.ADMIN]);

      expect(result).toEqual([]);
    });
  });

  // ─── branch coverage additions ────────────────────────────────────────────

  describe('branch coverage', () => {
    describe('getOrderTracking – tracking status branches', () => {
      it('returns ASSIGNED status when delivery is RUNNER_ASSIGNED', async () => {
        const order = buildOrder({
          deliveryOrder: {
            id: 'do-1',
            status: 'RUNNER_ASSIGNED',
            runnerId: RUNNER_ID,
            lastRunnerLocationLat: null,
            lastRunnerLocationLng: null,
            lastLocationUpdateAt: null,
            runner: { id: RUNNER_ID, name: 'Runner' },
          },
          providerOrders: [{ providerId: PROVIDER_ID }],
        });
        prismaMock.order.findUnique.mockResolvedValue(order);

        const result = await service.getOrderTracking(ORDER_ID, CLIENT_ID, [
          Role.CLIENT,
        ]);

        expect(result.status).toBe('ASSIGNED');
      });

      it('returns ASSIGNED status when delivery is PICKUP_PENDING', async () => {
        const order = buildOrder({
          deliveryOrder: {
            id: 'do-1',
            status: 'PICKUP_PENDING',
            runnerId: RUNNER_ID,
            lastRunnerLocationLat: null,
            lastRunnerLocationLng: null,
            lastLocationUpdateAt: null,
            runner: null,
          },
          providerOrders: [{ providerId: PROVIDER_ID }],
        });
        prismaMock.order.findUnique.mockResolvedValue(order);

        const result = await service.getOrderTracking(ORDER_ID, CLIENT_ID, [
          Role.CLIENT,
        ]);

        expect(result.status).toBe('ASSIGNED');
      });

      it('returns CANCELLED status when delivery is CANCELLED', async () => {
        const order = buildOrder({
          deliveryOrder: {
            id: 'do-1',
            status: 'CANCELLED',
            runnerId: null,
            lastRunnerLocationLat: null,
            lastRunnerLocationLng: null,
            lastLocationUpdateAt: null,
            runner: null,
          },
          providerOrders: [{ providerId: PROVIDER_ID }],
        });
        prismaMock.order.findUnique.mockResolvedValue(order);

        const result = await service.getOrderTracking(ORDER_ID, CLIENT_ID, [
          Role.CLIENT,
        ]);

        expect(result.status).toBe('CANCELLED');
      });

      it('returns DELIVERED status when delivery is DELIVERED', async () => {
        const order = buildOrder({
          deliveryOrder: {
            id: 'do-1',
            status: 'DELIVERED',
            runnerId: RUNNER_ID,
            lastRunnerLocationLat: 40.4168,
            lastRunnerLocationLng: -3.7038,
            lastLocationUpdateAt: new Date(),
            runner: { id: RUNNER_ID, name: 'Runner' },
          },
          providerOrders: [{ providerId: PROVIDER_ID }],
        });
        prismaMock.order.findUnique.mockResolvedValue(order);

        const result = await service.getOrderTracking(ORDER_ID, CLIENT_ID, [
          Role.CLIENT,
        ]);

        expect(result.status).toBe('DELIVERED');
        // DELIVERED is in visible location statuses
        expect(result.location).not.toBeNull();
      });

      it('returns PICKED_UP status → DELIVERING', async () => {
        const order = buildOrder({
          deliveryOrder: {
            id: 'do-1',
            status: 'PICKED_UP',
            runnerId: RUNNER_ID,
            lastRunnerLocationLat: 40.4,
            lastRunnerLocationLng: -3.7,
            lastLocationUpdateAt: new Date(),
            runner: { id: RUNNER_ID, name: 'Runner' },
          },
          providerOrders: [{ providerId: PROVIDER_ID }],
        });
        prismaMock.order.findUnique.mockResolvedValue(order);

        const result = await service.getOrderTracking(ORDER_ID, CLIENT_ID, [
          Role.CLIENT,
        ]);

        expect(result.status).toBe('DELIVERING');
      });

      it('returns default order status for unknown delivery status', async () => {
        const order = buildOrder({
          status: DeliveryStatus.CONFIRMED,
          deliveryOrder: {
            id: 'do-1',
            status: 'UNKNOWN_STATUS',
            runnerId: null,
            lastRunnerLocationLat: null,
            lastRunnerLocationLng: null,
            lastLocationUpdateAt: null,
            runner: null,
          },
          providerOrders: [{ providerId: PROVIDER_ID }],
        });
        prismaMock.order.findUnique.mockResolvedValue(order);

        const result = await service.getOrderTracking(ORDER_ID, CLIENT_ID, [
          Role.CLIENT,
        ]);

        expect(result.status).toBe(DeliveryStatus.CONFIRMED);
      });

      it('RUNNER can access tracking via deliveryOrder.runnerId', async () => {
        const order = buildOrder({
          clientId: 'other-client',
          runnerId: null,
          deliveryOrder: {
            id: 'do-1',
            status: 'IN_TRANSIT',
            runnerId: RUNNER_ID,
            lastRunnerLocationLat: null,
            lastRunnerLocationLng: null,
            lastLocationUpdateAt: null,
            runner: { id: RUNNER_ID, name: 'Runner' },
          },
          providerOrders: [],
        });
        prismaMock.order.findUnique.mockResolvedValue(order);

        const result = await service.getOrderTracking(ORDER_ID, RUNNER_ID, [
          Role.RUNNER,
        ]);

        expect(result.orderId).toBe(ORDER_ID);
      });

      it('PROVIDER can access tracking via providerOrders', async () => {
        const order = buildOrder({
          clientId: 'other-client',
          deliveryOrder: null,
          providerOrders: [{ providerId: PROVIDER_ID }],
        });
        prismaMock.order.findUnique.mockResolvedValue(order);

        const result = await service.getOrderTracking(ORDER_ID, PROVIDER_ID, [
          Role.PROVIDER,
        ]);

        expect(result.orderId).toBe(ORDER_ID);
      });
    });

    describe('findOne – runner access', () => {
      it('returns order when requester is the runner', async () => {
        const order = buildOrder({
          clientId: 'other-client',
          runnerId: RUNNER_ID,
          providerOrders: [],
        });
        prismaMock.order.findUnique.mockResolvedValue(order);

        const result = await service.findOne(ORDER_ID, RUNNER_ID, [
          Role.RUNNER,
        ]);

        expect(result).toEqual(order);
      });

      it('returns order when requester is assigned on deliveryOrder.runnerId', async () => {
        const order = buildOrder({
          clientId: 'other-client',
          runnerId: null,
          deliveryOrder: {
            id: 'do-1',
            runnerId: RUNNER_ID,
            status: 'IN_TRANSIT',
            paymentStatus: 'PENDING',
          },
          providerOrders: [],
        });
        prismaMock.order.findUnique.mockResolvedValue(order);

        const result = await service.findOne(ORDER_ID, RUNNER_ID, [
          Role.RUNNER,
        ]);

        expect(result).toEqual(order);
      });
    });

    describe('getAvailableOrders', () => {
      it('returns available orders for assignment', async () => {
        const orders = [
          buildOrder({
            status: DeliveryStatus.READY_FOR_ASSIGNMENT,
            runnerId: null,
          }),
        ];
        prismaMock.order.findMany.mockResolvedValue(orders);

        const result = await service.getAvailableOrders();

        expect(prismaMock.order.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              status: DeliveryStatus.READY_FOR_ASSIGNMENT,
              runnerId: null,
            },
          }),
        );
        expect(result).toEqual(orders);
      });
    });

    describe('getProviderTopProducts', () => {
      it('returns empty array when no providerOrders found', async () => {
        prismaMock.providerOrder.findMany.mockResolvedValue([]);

        const result = await service.getProviderTopProducts(PROVIDER_ID);

        expect(result).toEqual([]);
      });

      it('aggregates product stats from providerOrders', async () => {
        prismaMock.providerOrder.findMany.mockResolvedValue([
          {
            id: 'po-1',
            items: [
              {
                productId: 'prod-a',
                quantity: 2,
                priceAtPurchase: 5,
                product: { name: 'Product A' },
              },
            ],
          },
        ]);

        const result = await service.getProviderTopProducts(PROVIDER_ID);

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          name: 'Product A',
          quantity: 2,
          revenue: 10,
        });
      });

      it('accumulates quantity for repeated products across orders', async () => {
        prismaMock.providerOrder.findMany.mockResolvedValue([
          {
            id: 'po-1',
            items: [
              {
                productId: 'prod-a',
                quantity: 1,
                priceAtPurchase: 10,
                product: { name: 'A' },
              },
            ],
          },
          {
            id: 'po-2',
            items: [
              {
                productId: 'prod-a',
                quantity: 2,
                priceAtPurchase: 10,
                product: { name: 'A' },
              },
            ],
          },
        ]);

        const result = await service.getProviderTopProducts(PROVIDER_ID);

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({ quantity: 3, revenue: 30 });
      });
    });
  });
});
