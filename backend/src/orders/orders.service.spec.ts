import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DeliveryStatus, ProviderOrderStatus, Role } from '@prisma/client';
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
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      product: {
        findMany: jest.fn(),
      },
      providerOrder: {
        updateMany: jest.fn(),
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
        expect.objectContaining({ id: 'po-provider-1', providerId: 'provider-1' }),
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
