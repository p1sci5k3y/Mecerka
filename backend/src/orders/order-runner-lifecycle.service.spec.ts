import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DeliveryStatus, ProviderOrderStatus } from '@prisma/client';
import { OrderRunnerLifecycleService } from './order-runner-lifecycle.service';

describe('OrderRunnerLifecycleService', () => {
  let service: OrderRunnerLifecycleService;
  let repositoryMock: any;
  let eventEmitterMock: any;

  beforeEach(() => {
    repositoryMock = {
      findById: jest.fn(),
      findWithProviderOrders: jest.fn(),
      acceptOrderOptimistic: jest.fn(),
      completeOrderOptimistic: jest.fn(),
      findRunnerProfile: jest.fn(),
      updateStatus: jest.fn(),
    };
    eventEmitterMock = { emit: jest.fn() };

    service = new OrderRunnerLifecycleService(
      repositoryMock,
      eventEmitterMock as EventEmitter2,
    );
  });

  it('accepts an eligible order for an active runner with Stripe', async () => {
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

    expect(result?.status).toBe(DeliveryStatus.ASSIGNED);
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      'order.stateChanged',
      expect.objectContaining({
        orderId: 'ord-1',
        status: DeliveryStatus.ASSIGNED,
      }),
    );
  });

  it('marks an assigned order in transit when all active provider orders are picked up', async () => {
    repositoryMock.findWithProviderOrders.mockResolvedValue({
      id: 'ord-1',
      runnerId: 'runner-1',
      status: DeliveryStatus.ASSIGNED,
      providerOrders: [
        { id: 'po-1', status: ProviderOrderStatus.PICKED_UP },
        { id: 'po-2', status: ProviderOrderStatus.REJECTED_BY_STORE },
        { id: 'po-3', status: ProviderOrderStatus.PICKED_UP },
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
      expect.objectContaining({
        type: 'order.in_transit',
        orderId: 'ord-1',
      }),
    );
  });

  it('completes an in-transit order for the assigned runner', async () => {
    repositoryMock.findById
      .mockResolvedValueOnce({
        id: 'ord-1',
        status: DeliveryStatus.IN_TRANSIT,
      })
      .mockResolvedValue({ id: 'ord-1', status: DeliveryStatus.DELIVERED });
    repositoryMock.completeOrderOptimistic.mockResolvedValue(1);

    const result = await service.completeOrder('ord-1', 'runner-1');

    expect(result?.status).toBe(DeliveryStatus.DELIVERED);
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      'order.stateChanged',
      expect.objectContaining({
        type: 'order.delivered',
        orderId: 'ord-1',
      }),
    );
  });

  it('rejects markInTransit when not all active provider orders are picked up', async () => {
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
      new ConflictException(
        'All active provider orders must be PICKED_UP before marking IN_TRANSIT',
      ),
    );
  });

  it('rejects acceptOrder when the order does not exist', async () => {
    repositoryMock.findRunnerProfile.mockResolvedValue({
      stripeAccountId: 'acct_runner',
      runnerProfile: { isActive: true },
    });
    repositoryMock.findById.mockResolvedValue(null);

    await expect(service.acceptOrder('missing', 'runner-1')).rejects.toThrow(
      new NotFoundException('Order not found'),
    );
  });

  it('rejects completeOrder when the state is not deliverable', async () => {
    repositoryMock.findById.mockResolvedValue({
      id: 'ord-1',
      status: DeliveryStatus.ASSIGNED,
    });

    await expect(service.completeOrder('ord-1', 'runner-1')).rejects.toThrow(
      new BadRequestException('Order cannot transition to DELIVERED'),
    );
  });

  it('rejects acceptOrder when runner profile is inactive', async () => {
    repositoryMock.findRunnerProfile.mockResolvedValue({
      stripeAccountId: 'acct_runner',
      runnerProfile: { isActive: false },
    });

    await expect(service.acceptOrder('ord-1', 'runner-1')).rejects.toThrow(
      new ForbiddenException(
        'Tu perfil de runner no esta activo para aceptar pedidos.',
      ),
    );
  });
});
