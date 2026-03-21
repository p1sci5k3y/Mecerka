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
        expect.objectContaining({ where: { clientId: CLIENT_ID } }),
      );
      expect(result).toEqual(orders);
    });

    it('returns runner orders for RUNNER role', async () => {
      const orders = [buildOrder({ runnerId: RUNNER_ID })];
      prismaMock.order.findMany.mockResolvedValue(orders);

      const result = await service.findAll(RUNNER_ID, [Role.RUNNER]);

      expect(prismaMock.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { runnerId: RUNNER_ID } }),
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
        }),
      );
      expect(Array.isArray(result)).toBe(true);
    });

    it('returns empty array for unknown role', async () => {
      const result = await service.findAll('unknown-user', []);

      expect(result).toEqual([]);
      expect(prismaMock.order.findMany).not.toHaveBeenCalled();
    });
  });
});
