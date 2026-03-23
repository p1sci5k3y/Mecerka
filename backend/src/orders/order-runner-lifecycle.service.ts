import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DeliveryStatus, ProviderOrderStatus } from '@prisma/client';
import {
  OrderDeliveredEvent,
  OrderInTransitEvent,
} from '../domain/events/order-events';
import { IOrderRepository } from './repositories/order.repository.interface';
import { canTransitionOrder } from './utils/state-machine';

export class OrderRunnerLifecycleService {
  private readonly logger = new Logger(OrderRunnerLifecycleService.name);

  constructor(
    private readonly orderRepository: IOrderRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async acceptOrder(id: string, runnerId: string) {
    const runner = await this.orderRepository.findRunnerProfile(runnerId);

    if (!runner?.runnerProfile?.isActive) {
      throw new ForbiddenException(
        'Tu perfil de runner no esta activo para aceptar pedidos.',
      );
    }

    if (!runner.stripeAccountId) {
      throw new ForbiddenException(
        'Debes completar tu registro financiero en Stripe antes de aceptar pedidos.',
      );
    }

    const order = await this.orderRepository.findById(id);
    if (!order) throw new NotFoundException('Order not found');
    if (!canTransitionOrder(order.status, DeliveryStatus.ASSIGNED)) {
      throw new BadRequestException('Order cannot transition to ASSIGNED');
    }

    const count = await this.orderRepository.acceptOrderOptimistic(
      id,
      runnerId,
    );

    if (count === 0) {
      throw new BadRequestException(
        'Order is already accepted, cannot be assigned, or you are trying to deliver your own order',
      );
    }

    this.eventEmitter.emit('order.stateChanged', {
      orderId: id,
      status: DeliveryStatus.ASSIGNED,
    });
    this.logStructuredEvent(
      'order.state_transition',
      { orderId: id, runnerId },
      'Order assigned to runner',
    );

    return this.orderRepository.findById(id);
  }

  async completeOrder(id: string, runnerId: string) {
    const order = await this.orderRepository.findById(id);
    if (!order) throw new NotFoundException('Order not found');
    if (!canTransitionOrder(order.status, DeliveryStatus.DELIVERED)) {
      throw new BadRequestException('Order cannot transition to DELIVERED');
    }

    const count = await this.orderRepository.completeOrderOptimistic(
      id,
      runnerId,
    );

    if (count === 0) {
      throw new BadRequestException(
        'Order cannot be completed in its current state (Must be IN_TRANSIT), or you are not the assigned runner',
      );
    }

    const deliveredEvent: OrderDeliveredEvent = {
      type: 'order.delivered',
      orderId: id,
      occurredAt: new Date(),
    };
    this.eventEmitter.emit('order.stateChanged', deliveredEvent);
    this.logStructuredEvent(
      'order.state_transition',
      { orderId: id, runnerId },
      'Order marked as delivered',
    );

    return this.orderRepository.findById(id);
  }

  async markInTransit(id: string, runnerId: string) {
    const order = await this.orderRepository.findWithProviderOrders(id);

    if (!order) throw new NotFoundException('Order not found');

    if (order.runnerId !== runnerId) {
      throw new ForbiddenException(
        'You are not the assigned runner for this order',
      );
    }

    if (
      !canTransitionOrder(order.status, DeliveryStatus.IN_TRANSIT) ||
      order.status !== DeliveryStatus.ASSIGNED
    ) {
      throw new ConflictException(
        'Order must be in ASSIGNED state to mark as IN_TRANSIT',
      );
    }

    const activeProviderOrders = order.providerOrders.filter(
      (providerOrder) =>
        providerOrder.status !== ProviderOrderStatus.REJECTED_BY_STORE &&
        providerOrder.status !== ProviderOrderStatus.CANCELLED,
    );
    const allPickedUp =
      activeProviderOrders.length > 0 &&
      activeProviderOrders.every(
        (providerOrder) =>
          providerOrder.status === ProviderOrderStatus.PICKED_UP,
      );

    if (!allPickedUp) {
      throw new ConflictException(
        'All active provider orders must be PICKED_UP before marking IN_TRANSIT',
      );
    }

    const updated = await this.orderRepository.updateStatus(
      id,
      DeliveryStatus.IN_TRANSIT,
    );

    const inTransitEvent: OrderInTransitEvent = {
      type: 'order.in_transit',
      orderId: id,
      driverId: runnerId,
      occurredAt: new Date(),
    };
    this.eventEmitter.emit('order.stateChanged', inTransitEvent);
    this.logStructuredEvent(
      'order.state_transition',
      { orderId: id, runnerId },
      'Order marked as in transit',
    );

    return updated;
  }

  private logStructuredEvent(
    event: string,
    payload: Record<string, string | number | boolean | null | undefined>,
    message: string,
  ) {
    this.logger.log(
      JSON.stringify({
        event,
        message,
        ...payload,
      }),
    );
  }
}
