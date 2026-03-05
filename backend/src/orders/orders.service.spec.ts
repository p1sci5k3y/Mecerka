import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DeliveryStatus, ProviderOrderStatus, Role } from '@prisma/client';
import {
  ConflictException,
} from '@nestjs/common';

describe('OrdersService (Lifecycle Transitions & RBAC)', () => {
  let service: OrdersService;
  let prismaMock: any;
  let eventEmitterMock: any;

  beforeEach(async () => {
    prismaMock = {
      order: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      providerOrder: {
        updateMany: jest.fn(),
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
});
