import { Test, TestingModule } from '@nestjs/testing';
import { OrderStatusService } from './order-status.service';
import { IOrderRepository } from './repositories/order.repository.interface';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DeliveryStatus, ProviderOrderStatus, Role } from '@prisma/client';

describe('OrderStatusService – State Machine', () => {
  let service: OrderStatusService;
  let repositoryMock: any;
  let eventEmitterMock: any;

  beforeEach(async () => {
    repositoryMock = {
      findById: jest.fn(),
      findWithProviderOrders: jest.fn(),
      findWithProviderOrdersAndItems: jest.fn(),
      findProviderOrderWithOrder: jest.fn(),
      findProviderOrderById: jest.fn(),
      updateStatus: jest.fn(),
      updateProviderOrderStatusOptimistic: jest.fn(),
      updateManyProviderOrdersStatus: jest.fn(),
      acceptOrderOptimistic: jest.fn(),
      completeOrderOptimistic: jest.fn(),
      findRunnerProfile: jest.fn(),
      cancelWithInventoryRestore: jest.fn(),
      update: jest.fn(),
      findByClientId: jest.fn(),
      countByClient: jest.fn(),
    };

    eventEmitterMock = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderStatusService,
        { provide: IOrderRepository, useValue: repositoryMock },
        { provide: EventEmitter2, useValue: eventEmitterMock },
      ],
    }).compile();

    service = module.get<OrderStatusService>(OrderStatusService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // evaluateReadyForAssignment
  // ──────────────────────────────────────────────────────────────────────────
  describe('evaluateReadyForAssignment', () => {
    it('transitions CONFIRMED → READY_FOR_ASSIGNMENT when all provider orders are READY_FOR_PICKUP', async () => {
      repositoryMock.findWithProviderOrders.mockResolvedValue({
        id: 'ord-1',
        status: DeliveryStatus.CONFIRMED,
        providerOrders: [
          { id: 'po-1', status: ProviderOrderStatus.READY_FOR_PICKUP },
          { id: 'po-2', status: ProviderOrderStatus.READY_FOR_PICKUP },
        ],
      });
      repositoryMock.updateStatus.mockResolvedValue({
        id: 'ord-1',
        status: DeliveryStatus.READY_FOR_ASSIGNMENT,
      });

      const result = await service.evaluateReadyForAssignment('ord-1');

      expect(repositoryMock.updateStatus).toHaveBeenCalledWith(
        'ord-1',
        DeliveryStatus.READY_FOR_ASSIGNMENT,
      );
      expect(result).toMatchObject({
        event: 'order.stateChanged',
        data: { orderId: 'ord-1', status: DeliveryStatus.READY_FOR_ASSIGNMENT },
      });
    });

    it('does not transition when a provider order is still PENDING', async () => {
      repositoryMock.findWithProviderOrders.mockResolvedValue({
        id: 'ord-1',
        status: DeliveryStatus.CONFIRMED,
        providerOrders: [
          { id: 'po-1', status: ProviderOrderStatus.READY_FOR_PICKUP },
          { id: 'po-2', status: ProviderOrderStatus.PENDING },
        ],
      });

      const result = await service.evaluateReadyForAssignment('ord-1');

      expect(repositoryMock.updateStatus).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('does not transition when a provider order is still ACCEPTING', async () => {
      repositoryMock.findWithProviderOrders.mockResolvedValue({
        id: 'ord-1',
        status: DeliveryStatus.CONFIRMED,
        providerOrders: [
          { id: 'po-1', status: ProviderOrderStatus.READY_FOR_PICKUP },
          { id: 'po-2', status: ProviderOrderStatus.ACCEPTED },
        ],
      });

      await service.evaluateReadyForAssignment('ord-1');

      expect(repositoryMock.updateStatus).not.toHaveBeenCalled();
    });

    it('returns partialCancelled event when some provider orders are REJECTED_BY_STORE', async () => {
      repositoryMock.findWithProviderOrders.mockResolvedValue({
        id: 'ord-1',
        status: DeliveryStatus.CONFIRMED,
        providerOrders: [
          { id: 'po-1', status: ProviderOrderStatus.READY_FOR_PICKUP },
          { id: 'po-2', status: ProviderOrderStatus.REJECTED_BY_STORE },
        ],
      });

      const result = await service.evaluateReadyForAssignment('ord-1');

      expect(repositoryMock.updateStatus).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        event: 'order.partialCancelled',
        data: { orderId: 'ord-1' },
      });
    });

    it('returns undefined if order is not CONFIRMED', async () => {
      repositoryMock.findWithProviderOrders.mockResolvedValue({
        id: 'ord-1',
        status: DeliveryStatus.ASSIGNED,
        providerOrders: [],
      });

      const result = await service.evaluateReadyForAssignment('ord-1');

      expect(repositoryMock.updateStatus).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('returns undefined if order does not exist', async () => {
      repositoryMock.findWithProviderOrders.mockResolvedValue(null);

      const result = await service.evaluateReadyForAssignment('nonexistent');

      expect(result).toBeUndefined();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // updateProviderOrderStatus
  // ──────────────────────────────────────────────────────────────────────────
  describe('updateProviderOrderStatus', () => {
    const makeProviderOrder = (
      status: ProviderOrderStatus,
      overrides: Record<string, any> = {},
    ) => ({
      id: 'po-1',
      orderId: 'ord-1',
      providerId: 'provider-1',
      status,
      order: {
        id: 'ord-1',
        runnerId: 'runner-1',
        clientId: 'client-1',
        status: DeliveryStatus.CONFIRMED,
        providerOrders: [],
      },
      ...overrides,
    });

    it('throws NotFoundException when provider order does not exist', async () => {
      repositoryMock.findProviderOrderWithOrder.mockResolvedValue(null);

      await expect(
        service.updateProviderOrderStatus(
          'po-missing',
          'provider-1',
          [Role.PROVIDER],
          ProviderOrderStatus.ACCEPTED,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when user has no matching role for the order', async () => {
      repositoryMock.findProviderOrderWithOrder.mockResolvedValue(
        makeProviderOrder(ProviderOrderStatus.PENDING),
      );

      await expect(
        service.updateProviderOrderStatus(
          'po-1',
          'stranger-user',
          [Role.CLIENT],
          ProviderOrderStatus.ACCEPTED,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('PROVIDER can transition PENDING → ACCEPTED', async () => {
      const po = makeProviderOrder(ProviderOrderStatus.PENDING);
      repositoryMock.findProviderOrderWithOrder.mockResolvedValue(po);
      repositoryMock.updateProviderOrderStatusOptimistic.mockResolvedValue(1);
      repositoryMock.findProviderOrderById.mockResolvedValue({
        ...po,
        status: ProviderOrderStatus.ACCEPTED,
      });
      // evaluateReadyForAssignment is not triggered for ACCEPTED
      repositoryMock.findWithProviderOrders.mockResolvedValue(null);

      const result = await service.updateProviderOrderStatus(
        'po-1',
        'provider-1',
        [Role.PROVIDER],
        ProviderOrderStatus.ACCEPTED,
      );

      expect(
        repositoryMock.updateProviderOrderStatusOptimistic,
      ).toHaveBeenCalledWith(
        'po-1',
        ProviderOrderStatus.PENDING,
        ProviderOrderStatus.ACCEPTED,
      );
      expect(result?.status).toBe(ProviderOrderStatus.ACCEPTED);
    });

    it('PROVIDER can transition PENDING → REJECTED_BY_STORE', async () => {
      const po = makeProviderOrder(ProviderOrderStatus.PENDING);
      repositoryMock.findProviderOrderWithOrder.mockResolvedValue(po);
      repositoryMock.updateProviderOrderStatusOptimistic.mockResolvedValue(1);
      repositoryMock.findProviderOrderById.mockResolvedValue({
        ...po,
        status: ProviderOrderStatus.REJECTED_BY_STORE,
      });
      // evaluateReadyForAssignment triggered
      repositoryMock.findWithProviderOrders.mockResolvedValue({
        id: 'ord-1',
        status: DeliveryStatus.CONFIRMED,
        providerOrders: [
          { id: 'po-1', status: ProviderOrderStatus.REJECTED_BY_STORE },
        ],
      });

      await service.updateProviderOrderStatus(
        'po-1',
        'provider-1',
        [Role.PROVIDER],
        ProviderOrderStatus.REJECTED_BY_STORE,
      );

      expect(
        repositoryMock.updateProviderOrderStatusOptimistic,
      ).toHaveBeenCalledWith(
        'po-1',
        ProviderOrderStatus.PENDING,
        ProviderOrderStatus.REJECTED_BY_STORE,
      );
    });

    it('throws BadRequestException for illegal transition ACCEPTED → READY_FOR_PICKUP by PROVIDER', async () => {
      const po = makeProviderOrder(ProviderOrderStatus.ACCEPTED);
      repositoryMock.findProviderOrderWithOrder.mockResolvedValue(po);

      await expect(
        service.updateProviderOrderStatus(
          'po-1',
          'provider-1',
          [Role.PROVIDER],
          ProviderOrderStatus.READY_FOR_PICKUP,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for illegal transition PENDING → PICKED_UP', async () => {
      const po = makeProviderOrder(ProviderOrderStatus.PENDING);
      repositoryMock.findProviderOrderWithOrder.mockResolvedValue(po);

      await expect(
        service.updateProviderOrderStatus(
          'po-1',
          'provider-1',
          [Role.PROVIDER],
          ProviderOrderStatus.PICKED_UP,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('RUNNER can transition READY_FOR_PICKUP → PICKED_UP', async () => {
      const po = makeProviderOrder(ProviderOrderStatus.READY_FOR_PICKUP, {
        order: {
          id: 'ord-1',
          runnerId: 'runner-1',
          clientId: 'client-1',
          status: DeliveryStatus.ASSIGNED,
          providerOrders: [],
        },
      });
      repositoryMock.findProviderOrderWithOrder.mockResolvedValue(po);
      repositoryMock.updateProviderOrderStatusOptimistic.mockResolvedValue(1);
      repositoryMock.findProviderOrderById.mockResolvedValue({
        ...po,
        status: ProviderOrderStatus.PICKED_UP,
      });
      repositoryMock.findWithProviderOrders.mockResolvedValue({
        id: 'ord-1',
        status: DeliveryStatus.ASSIGNED,
        providerOrders: [{ id: 'po-1', status: ProviderOrderStatus.PICKED_UP }],
      });
      repositoryMock.updateStatus.mockResolvedValue({
        id: 'ord-1',
        status: DeliveryStatus.IN_TRANSIT,
      });

      const result = await service.updateProviderOrderStatus(
        'po-1',
        'runner-1',
        [Role.RUNNER],
        ProviderOrderStatus.PICKED_UP,
      );

      expect(result?.status).toBe(ProviderOrderStatus.PICKED_UP);
    });

    it('CLIENT cannot transition PENDING → ACCEPTED (wrong role for that transition)', async () => {
      const po = makeProviderOrder(ProviderOrderStatus.PENDING, {
        order: {
          id: 'ord-1',
          runnerId: null,
          clientId: 'client-1',
          status: DeliveryStatus.CONFIRMED,
          providerOrders: [],
        },
      });
      repositoryMock.findProviderOrderWithOrder.mockResolvedValue(po);

      await expect(
        service.updateProviderOrderStatus(
          'po-1',
          'client-1',
          [Role.CLIENT],
          ProviderOrderStatus.ACCEPTED,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException on concurrent update (optimistic lock miss)', async () => {
      const po = makeProviderOrder(ProviderOrderStatus.PENDING);
      repositoryMock.findProviderOrderWithOrder.mockResolvedValue(po);
      repositoryMock.updateProviderOrderStatusOptimistic.mockResolvedValue(0); // simulates race condition

      await expect(
        service.updateProviderOrderStatus(
          'po-1',
          'provider-1',
          [Role.PROVIDER],
          ProviderOrderStatus.ACCEPTED,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('ADMIN can cancel any provider order in ACCEPTED state', async () => {
      const po = makeProviderOrder(ProviderOrderStatus.ACCEPTED, {
        order: {
          id: 'ord-1',
          runnerId: null,
          clientId: 'client-1',
          status: DeliveryStatus.CONFIRMED,
          providerOrders: [],
        },
      });
      repositoryMock.findProviderOrderWithOrder.mockResolvedValue(po);
      repositoryMock.updateProviderOrderStatusOptimistic.mockResolvedValue(1);
      repositoryMock.findProviderOrderById.mockResolvedValue({
        ...po,
        status: ProviderOrderStatus.CANCELLED,
      });
      repositoryMock.findWithProviderOrders.mockResolvedValue({
        id: 'ord-1',
        status: DeliveryStatus.CONFIRMED,
        providerOrders: [{ id: 'po-1', status: ProviderOrderStatus.CANCELLED }],
      });

      const result = await service.updateProviderOrderStatus(
        'po-1',
        'admin-1',
        [Role.ADMIN],
        ProviderOrderStatus.CANCELLED,
      );

      expect(result?.status).toBe(ProviderOrderStatus.CANCELLED);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // acceptOrder
  // ──────────────────────────────────────────────────────────────────────────
  describe('acceptOrder', () => {
    it('transitions READY_FOR_ASSIGNMENT → ASSIGNED when runner is eligible', async () => {
      repositoryMock.findRunnerProfile.mockResolvedValue({
        stripeAccountId: 'acct_runner',
        runnerProfile: { isActive: true },
      });
      repositoryMock.findById
        .mockResolvedValueOnce({
          id: 'ord-1',
          status: DeliveryStatus.READY_FOR_ASSIGNMENT,
        })
        .mockResolvedValue({ id: 'ord-1', status: DeliveryStatus.ASSIGNED });
      repositoryMock.acceptOrderOptimistic.mockResolvedValue(1);

      const result = await service.acceptOrder('ord-1', 'runner-1');

      expect(repositoryMock.acceptOrderOptimistic).toHaveBeenCalledWith(
        'ord-1',
        'runner-1',
      );
      expect(result?.status).toBe(DeliveryStatus.ASSIGNED);
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        'order.stateChanged',
        expect.objectContaining({
          orderId: 'ord-1',
          status: DeliveryStatus.ASSIGNED,
        }),
      );
    });

    it('throws ForbiddenException when runner profile is inactive', async () => {
      repositoryMock.findRunnerProfile.mockResolvedValue({
        stripeAccountId: 'acct_runner',
        runnerProfile: { isActive: false },
      });

      await expect(service.acceptOrder('ord-1', 'runner-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws ForbiddenException when runner has no Stripe account', async () => {
      repositoryMock.findRunnerProfile.mockResolvedValue({
        stripeAccountId: null,
        runnerProfile: { isActive: true },
      });

      await expect(service.acceptOrder('ord-1', 'runner-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws NotFoundException when order does not exist', async () => {
      repositoryMock.findRunnerProfile.mockResolvedValue({
        stripeAccountId: 'acct_runner',
        runnerProfile: { isActive: true },
      });
      repositoryMock.findById.mockResolvedValue(null);

      await expect(service.acceptOrder('missing', 'runner-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when order is not in READY_FOR_ASSIGNMENT state', async () => {
      repositoryMock.findRunnerProfile.mockResolvedValue({
        stripeAccountId: 'acct_runner',
        runnerProfile: { isActive: true },
      });
      repositoryMock.findById.mockResolvedValue({
        id: 'ord-1',
        status: DeliveryStatus.CONFIRMED,
      });

      await expect(service.acceptOrder('ord-1', 'runner-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when order is PENDING (cannot skip to ASSIGNED)', async () => {
      repositoryMock.findRunnerProfile.mockResolvedValue({
        stripeAccountId: 'acct_runner',
        runnerProfile: { isActive: true },
      });
      repositoryMock.findById.mockResolvedValue({
        id: 'ord-1',
        status: DeliveryStatus.PENDING,
      });

      await expect(service.acceptOrder('ord-1', 'runner-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when order is already ASSIGNED (optimistic lock)', async () => {
      repositoryMock.findRunnerProfile.mockResolvedValue({
        stripeAccountId: 'acct_runner',
        runnerProfile: { isActive: true },
      });
      repositoryMock.findById.mockResolvedValue({
        id: 'ord-1',
        status: DeliveryStatus.READY_FOR_ASSIGNMENT,
      });
      repositoryMock.acceptOrderOptimistic.mockResolvedValue(0); // already taken

      await expect(service.acceptOrder('ord-1', 'runner-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // completeOrder
  // ──────────────────────────────────────────────────────────────────────────
  describe('completeOrder', () => {
    it('transitions IN_TRANSIT → DELIVERED', async () => {
      repositoryMock.findById
        .mockResolvedValueOnce({
          id: 'ord-1',
          status: DeliveryStatus.IN_TRANSIT,
        })
        .mockResolvedValue({ id: 'ord-1', status: DeliveryStatus.DELIVERED });
      repositoryMock.completeOrderOptimistic.mockResolvedValue(1);

      const result = await service.completeOrder('ord-1', 'runner-1');

      expect(repositoryMock.completeOrderOptimistic).toHaveBeenCalledWith(
        'ord-1',
        'runner-1',
      );
      expect(result?.status).toBe(DeliveryStatus.DELIVERED);
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        'order.stateChanged',
        expect.objectContaining({
          type: 'order.delivered',
          orderId: 'ord-1',
        }),
      );
    });

    it('throws NotFoundException when order does not exist', async () => {
      repositoryMock.findById.mockResolvedValue(null);

      await expect(
        service.completeOrder('missing', 'runner-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when order is ASSIGNED (not yet IN_TRANSIT)', async () => {
      repositoryMock.findById.mockResolvedValue({
        id: 'ord-1',
        status: DeliveryStatus.ASSIGNED,
      });

      await expect(service.completeOrder('ord-1', 'runner-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when order is already DELIVERED (terminal state)', async () => {
      repositoryMock.findById.mockResolvedValue({
        id: 'ord-1',
        status: DeliveryStatus.DELIVERED,
      });

      await expect(service.completeOrder('ord-1', 'runner-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when runner mismatch (optimistic lock)', async () => {
      repositoryMock.findById.mockResolvedValue({
        id: 'ord-1',
        status: DeliveryStatus.IN_TRANSIT,
      });
      repositoryMock.completeOrderOptimistic.mockResolvedValue(0); // wrong runner

      await expect(
        service.completeOrder('ord-1', 'wrong-runner'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // markInTransit
  // ──────────────────────────────────────────────────────────────────────────
  describe('markInTransit', () => {
    it('transitions ASSIGNED → IN_TRANSIT when all active provider orders are PICKED_UP', async () => {
      repositoryMock.findWithProviderOrders.mockResolvedValue({
        id: 'ord-1',
        runnerId: 'runner-1',
        status: DeliveryStatus.ASSIGNED,
        providerOrders: [
          { id: 'po-1', status: ProviderOrderStatus.PICKED_UP },
          { id: 'po-2', status: ProviderOrderStatus.PICKED_UP },
        ],
      });
      repositoryMock.updateStatus.mockResolvedValue({
        id: 'ord-1',
        status: DeliveryStatus.IN_TRANSIT,
      });

      const result = await service.markInTransit('ord-1', 'runner-1');

      expect(result.status).toBe(DeliveryStatus.IN_TRANSIT);
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        'order.stateChanged',
        expect.any(Object),
      );
    });

    it('ignores REJECTED_BY_STORE provider orders when checking all-PICKED_UP', async () => {
      repositoryMock.findWithProviderOrders.mockResolvedValue({
        id: 'ord-1',
        runnerId: 'runner-1',
        status: DeliveryStatus.ASSIGNED,
        providerOrders: [
          { id: 'po-1', status: ProviderOrderStatus.PICKED_UP },
          { id: 'po-2', status: ProviderOrderStatus.REJECTED_BY_STORE },
          { id: 'po-3', status: ProviderOrderStatus.CANCELLED },
        ],
      });
      repositoryMock.updateStatus.mockResolvedValue({
        id: 'ord-1',
        status: DeliveryStatus.IN_TRANSIT,
      });

      const result = await service.markInTransit('ord-1', 'runner-1');

      expect(result.status).toBe(DeliveryStatus.IN_TRANSIT);
    });

    it('throws ConflictException when a provider order is still READY_FOR_PICKUP', async () => {
      repositoryMock.findWithProviderOrders.mockResolvedValue({
        id: 'ord-1',
        runnerId: 'runner-1',
        status: DeliveryStatus.ASSIGNED,
        providerOrders: [
          { id: 'po-1', status: ProviderOrderStatus.PICKED_UP },
          { id: 'po-2', status: ProviderOrderStatus.READY_FOR_PICKUP },
        ],
      });

      await expect(service.markInTransit('ord-1', 'runner-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws ForbiddenException when runner is not the assigned runner', async () => {
      repositoryMock.findWithProviderOrders.mockResolvedValue({
        id: 'ord-1',
        runnerId: 'runner-1',
        status: DeliveryStatus.ASSIGNED,
        providerOrders: [{ id: 'po-1', status: ProviderOrderStatus.PICKED_UP }],
      });

      await expect(
        service.markInTransit('ord-1', 'other-runner'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when order does not exist', async () => {
      repositoryMock.findWithProviderOrders.mockResolvedValue(null);

      await expect(
        service.markInTransit('missing', 'runner-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when order is not in ASSIGNED state', async () => {
      repositoryMock.findWithProviderOrders.mockResolvedValue({
        id: 'ord-1',
        runnerId: 'runner-1',
        status: DeliveryStatus.CONFIRMED,
        providerOrders: [{ id: 'po-1', status: ProviderOrderStatus.PICKED_UP }],
      });

      await expect(service.markInTransit('ord-1', 'runner-1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // cancelOrder
  // ──────────────────────────────────────────────────────────────────────────
  describe('cancelOrder', () => {
    const makeOrder = (
      status: DeliveryStatus,
      clientId: string,
      providerOrders: any[] = [],
    ) => ({
      id: 'ord-1',
      status,
      clientId,
      providerOrders,
    });

    it('CLIENT can cancel a PENDING order', async () => {
      repositoryMock.findWithProviderOrdersAndItems.mockResolvedValue(
        makeOrder(DeliveryStatus.PENDING, 'client-1', [
          { id: 'po-1', status: ProviderOrderStatus.PENDING, items: [] },
        ]),
      );
      repositoryMock.cancelWithInventoryRestore.mockResolvedValue({
        id: 'ord-1',
        status: DeliveryStatus.CANCELLED,
        providerOrders: [],
      });

      const result = await service.cancelOrder('ord-1', 'client-1', [
        Role.CLIENT,
      ]);

      expect(result.status).toBe(DeliveryStatus.CANCELLED);
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        'order.stateChanged',
        expect.any(Object),
      );
    });

    it('CLIENT can cancel a CONFIRMED order that has rejected sub-orders', async () => {
      repositoryMock.findWithProviderOrdersAndItems.mockResolvedValue(
        makeOrder(DeliveryStatus.CONFIRMED, 'client-1', [
          {
            id: 'po-1',
            status: ProviderOrderStatus.READY_FOR_PICKUP,
            items: [],
          },
          {
            id: 'po-2',
            status: ProviderOrderStatus.REJECTED_BY_STORE,
            items: [],
          },
        ]),
      );
      repositoryMock.cancelWithInventoryRestore.mockResolvedValue({
        id: 'ord-1',
        status: DeliveryStatus.CANCELLED,
        providerOrders: [],
      });

      const result = await service.cancelOrder('ord-1', 'client-1', [
        Role.CLIENT,
      ]);

      expect(result.status).toBe(DeliveryStatus.CANCELLED);
    });

    it('CLIENT cannot cancel a CONFIRMED order without rejected sub-orders', async () => {
      repositoryMock.findWithProviderOrdersAndItems.mockResolvedValue(
        makeOrder(DeliveryStatus.CONFIRMED, 'client-1', [
          { id: 'po-1', status: ProviderOrderStatus.PREPARING, items: [] },
        ]),
      );

      await expect(
        service.cancelOrder('ord-1', 'client-1', [Role.CLIENT]),
      ).rejects.toThrow(ConflictException);
    });

    it('CLIENT cannot cancel an ASSIGNED order', async () => {
      repositoryMock.findWithProviderOrdersAndItems.mockResolvedValue(
        makeOrder(DeliveryStatus.ASSIGNED, 'client-1', []),
      );

      await expect(
        service.cancelOrder('ord-1', 'client-1', [Role.CLIENT]),
      ).rejects.toThrow(ConflictException);
    });

    it('CLIENT cannot cancel another client order', async () => {
      repositoryMock.findWithProviderOrdersAndItems.mockResolvedValue(
        makeOrder(DeliveryStatus.PENDING, 'other-client', []),
      );

      await expect(
        service.cancelOrder('ord-1', 'client-1', [Role.CLIENT]),
      ).rejects.toThrow(ForbiddenException);
    });

    it('ADMIN can cancel any non-terminal order regardless of state', async () => {
      repositoryMock.findWithProviderOrdersAndItems.mockResolvedValue(
        makeOrder(DeliveryStatus.ASSIGNED, 'client-1', [
          { id: 'po-1', status: ProviderOrderStatus.PICKED_UP, items: [] },
        ]),
      );
      repositoryMock.cancelWithInventoryRestore.mockResolvedValue({
        id: 'ord-1',
        status: DeliveryStatus.CANCELLED,
        providerOrders: [],
      });

      const result = await service.cancelOrder('ord-1', 'admin-1', [
        Role.ADMIN,
      ]);

      expect(result.status).toBe(DeliveryStatus.CANCELLED);
    });

    it('throws NotFoundException when order does not exist', async () => {
      repositoryMock.findWithProviderOrdersAndItems.mockResolvedValue(null);

      await expect(
        service.cancelOrder('missing', 'client-1', [Role.CLIENT]),
      ).rejects.toThrow(NotFoundException);
    });

    it('cannot cancel a DELIVERED order (terminal state)', async () => {
      repositoryMock.findWithProviderOrdersAndItems.mockResolvedValue(
        makeOrder(DeliveryStatus.DELIVERED, 'client-1', []),
      );

      await expect(
        service.cancelOrder('ord-1', 'admin-1', [Role.ADMIN]),
      ).rejects.toThrow(ConflictException);
    });

    it('cannot cancel an already CANCELLED order (terminal state)', async () => {
      repositoryMock.findWithProviderOrdersAndItems.mockResolvedValue(
        makeOrder(DeliveryStatus.CANCELLED, 'client-1', []),
      );

      await expect(
        service.cancelOrder('ord-1', 'admin-1', [Role.ADMIN]),
      ).rejects.toThrow(ConflictException);
    });

    it('passes correct itemsToRestore when cancelling a CONFIRMED order', async () => {
      repositoryMock.findWithProviderOrdersAndItems.mockResolvedValue(
        makeOrder(DeliveryStatus.CONFIRMED, 'client-1', [
          {
            id: 'po-1',
            status: ProviderOrderStatus.PREPARING,
            items: [{ productId: 'prod-1', quantity: 2 }],
          },
        ]),
      );
      repositoryMock.cancelWithInventoryRestore.mockResolvedValue({
        id: 'ord-1',
        status: DeliveryStatus.CANCELLED,
        providerOrders: [],
      });

      await service.cancelOrder('ord-1', 'admin-1', [Role.ADMIN]);

      expect(repositoryMock.cancelWithInventoryRestore).toHaveBeenCalledWith(
        'ord-1',
        ['po-1'],
        [{ productId: 'prod-1', quantity: 2 }],
      );
    });

    it('CLIENT cancelling a partially rejected CONFIRMED order only restores active sub-order inventory', async () => {
      repositoryMock.findWithProviderOrdersAndItems.mockResolvedValue(
        makeOrder(DeliveryStatus.CONFIRMED, 'client-1', [
          {
            id: 'po-1',
            status: ProviderOrderStatus.PREPARING,
            items: [{ productId: 'prod-1', quantity: 2 }],
          },
          {
            id: 'po-2',
            status: ProviderOrderStatus.REJECTED_BY_STORE,
            items: [{ productId: 'prod-2', quantity: 1 }],
          },
          {
            id: 'po-3',
            status: ProviderOrderStatus.CANCELLED,
            items: [{ productId: 'prod-3', quantity: 4 }],
          },
        ]),
      );
      repositoryMock.cancelWithInventoryRestore.mockResolvedValue({
        id: 'ord-1',
        status: DeliveryStatus.CANCELLED,
        providerOrders: [],
      });

      const result = await service.cancelOrder('ord-1', 'client-1', [
        Role.CLIENT,
      ]);

      expect(result.status).toBe(DeliveryStatus.CANCELLED);
      expect(repositoryMock.cancelWithInventoryRestore).toHaveBeenCalledWith(
        'ord-1',
        ['po-1'],
        [{ productId: 'prod-1', quantity: 2 }],
      );
    });
  });
});
