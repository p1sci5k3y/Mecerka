import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  DeliveryStatus,
  ProviderOrderStatus,
  RiskActorType,
  RiskCategory,
  Role,
} from '@prisma/client';
import {
  canTransitionOrder,
  canTransitionProviderOrder,
} from './utils/state-machine';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RiskService } from '../risk/risk.service';
import {
  OrderCancelledEvent,
  OrderDeliveredEvent,
  OrderInTransitEvent,
} from '../domain/events/order-events';
import { IOrderRepository } from './repositories/order.repository.interface';

@Injectable()
export class OrderStatusService {
  private readonly logger = new Logger(OrderStatusService.name);

  constructor(
    @Inject(IOrderRepository)
    private readonly orderRepository: IOrderRepository,
    private readonly eventEmitter: EventEmitter2,
    @Optional() private readonly riskService?: RiskService,
  ) {}

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

  private async emitRiskEvent(
    actorType: RiskActorType,
    actorId: string,
    category: RiskCategory,
    score: number,
    dedupKey: string,
    metadata?: Record<string, string | number | boolean>,
  ) {
    if (!this.riskService) {
      return;
    }

    try {
      await this.riskService.recordRiskEvent({
        actorType,
        actorId,
        category,
        score,
        dedupKey,
        metadata,
      });
      await this.riskService.recalculateRiskScore(actorType, actorId);
    } catch (error: any) {
      this.logger.warn(
        `risk.orders.integration_failed actorType=${actorType} actorId=${actorId} category=${category} message=${error.message}`,
      );
    }
  }

  private getActingRole(po: any, userId: string, roles: Role[]): Role | null {
    if (roles.includes(Role.ADMIN)) return Role.ADMIN;
    if (po.order.runnerId === userId && roles.includes(Role.RUNNER))
      return Role.RUNNER;
    if (po.providerId === userId && roles.includes(Role.PROVIDER))
      return Role.PROVIDER;
    if (po.order.clientId === userId && roles.includes(Role.CLIENT))
      return Role.CLIENT;
    return null;
  }

  async evaluateReadyForAssignment(orderId: string) {
    const order = await this.orderRepository.findWithProviderOrders(orderId);
    if (!order) return;
    if (order.status !== DeliveryStatus.CONFIRMED) return;

    const hasPendingOrPreparing = order.providerOrders.some((po) =>
      (
        [
          ProviderOrderStatus.PENDING,
          ProviderOrderStatus.ACCEPTED,
          ProviderOrderStatus.PREPARING,
        ] as ProviderOrderStatus[]
      ).includes(po.status),
    );

    const hasCancelledOrRejected = order.providerOrders.some((po) =>
      (
        [
          ProviderOrderStatus.REJECTED_BY_STORE,
          ProviderOrderStatus.CANCELLED,
        ] as ProviderOrderStatus[]
      ).includes(po.status),
    );

    if (hasPendingOrPreparing) {
      return; // Wait for other providers
    }

    if (hasCancelledOrRejected) {
      // Partial Fulfillment Scenario
      // The order remains in CONFIRMED state waiting for client decision
      return {
        event: 'order.partialCancelled',
        data: { orderId },
      };
    }

    // If all are READY_FOR_PICKUP (or PICKED_UP)
    if (
      !canTransitionOrder(order.status, DeliveryStatus.READY_FOR_ASSIGNMENT)
    ) {
      return; // Suppress and silently bypass illegal assignments
    }

    await this.orderRepository.updateStatus(
      orderId,
      DeliveryStatus.READY_FOR_ASSIGNMENT,
    );

    this.logStructuredEvent(
      'order.state_transition',
      {
        orderId,
      },
      'Order transitioned to READY_FOR_ASSIGNMENT',
    );

    return {
      event: 'order.stateChanged',
      data: { orderId, status: DeliveryStatus.READY_FOR_ASSIGNMENT },
    };
  }

  async updateProviderOrderStatus(
    providerOrderId: string,
    userId: string,
    roles: Role[],
    status: ProviderOrderStatus,
  ) {
    const po =
      await this.orderRepository.findProviderOrderWithOrder(providerOrderId);
    if (!po) throw new NotFoundException('ProviderOrder not found');

    const actingRole = this.getActingRole(po, userId, roles);

    if (!actingRole) {
      throw new ForbiddenException(
        'You do not have permission to update this provider order',
      );
    }

    if (!canTransitionProviderOrder(po.status, status, actingRole)) {
      throw new BadRequestException(
        `Illegal state transition from ${po.status} to ${status} for role ${actingRole}`,
      );
    }

    // Optimistic Concurrency Update
    const updatedCount =
      await this.orderRepository.updateProviderOrderStatusOptimistic(
        providerOrderId,
        po.status,
        status,
      );

    if (updatedCount === 0) {
      throw new ConflictException(
        'The order state has changed. Please refresh and try again.',
      );
    }

    // Propagate state upwards
    if (
      status === ProviderOrderStatus.READY_FOR_PICKUP ||
      status === ProviderOrderStatus.REJECTED_BY_STORE ||
      status === ProviderOrderStatus.CANCELLED
    ) {
      await this.evaluateReadyForAssignment(po.orderId);
    } else if (status === ProviderOrderStatus.PICKED_UP) {
      const order = await this.orderRepository.findWithProviderOrders(
        po.orderId,
      );
      if (order?.status === DeliveryStatus.ASSIGNED) {
        const activeOrders = order.providerOrders.filter(
          (o) =>
            o.status !== ProviderOrderStatus.REJECTED_BY_STORE &&
            o.status !== ProviderOrderStatus.CANCELLED,
        );
        const allPickedUp = activeOrders.every(
          (o) => o.status === ProviderOrderStatus.PICKED_UP,
        );
        if (allPickedUp) {
          await this.orderRepository.updateStatus(
            order.id,
            DeliveryStatus.IN_TRANSIT,
          );
          this.logStructuredEvent(
            'order.state_transition',
            {
              orderId: order.id,
            },
            'Order transitioned to IN_TRANSIT after all provider orders were picked up',
          );
        }
      }
    }

    const finalProviderOrder =
      await this.orderRepository.findProviderOrderById(providerOrderId);

    if (
      finalProviderOrder &&
      actingRole === Role.PROVIDER &&
      (status === ProviderOrderStatus.REJECTED_BY_STORE ||
        status === ProviderOrderStatus.CANCELLED)
    ) {
      await this.emitRiskEvent(
        RiskActorType.PROVIDER,
        userId,
        RiskCategory.PROVIDER_REJECTION_SPIKE,
        status === ProviderOrderStatus.REJECTED_BY_STORE ? 12 : 10,
        `provider-cancel:${providerOrderId}:${status}`,
        {
          providerOrderId,
          status,
        },
      );
    }

    return finalProviderOrder;
  }

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

    // Note: Invariant Rule 2 verification
    // Must check if all sub-orders are PICKED_UP before delivering, or trust current DB status logic.

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
      (po) =>
        po.status !== ProviderOrderStatus.REJECTED_BY_STORE &&
        po.status !== ProviderOrderStatus.CANCELLED,
    );
    const allPickedUp =
      activeProviderOrders.length > 0 &&
      activeProviderOrders.every(
        (po) => po.status === ProviderOrderStatus.PICKED_UP,
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

  async cancelOrder(id: string, userId: string, roles: Role[]) {
    const isAdmin = roles.includes(Role.ADMIN);
    const order = await this.orderRepository.findWithProviderOrdersAndItems(id);

    if (!order) throw new NotFoundException('Order not found');

    if (!isAdmin) {
      if (order.clientId !== userId) {
        throw new ForbiddenException('You are not the client of this order');
      }

      const hasCancelledOrRejectedSubOrders = order.providerOrders.some((po) =>
        (
          [
            ProviderOrderStatus.REJECTED_BY_STORE,
            ProviderOrderStatus.CANCELLED,
          ] as ProviderOrderStatus[]
        ).includes(po.status),
      );

      if (order.status !== DeliveryStatus.PENDING) {
        if (
          order.status === DeliveryStatus.CONFIRMED &&
          hasCancelledOrRejectedSubOrders
        ) {
          // Allowed: The order is in partial fulfillment waiting state.
        } else {
          throw new ConflictException(
            'Clients can only cancel PENDING orders, or CONFIRMED orders with rejected items',
          );
        }
      }
    }

    if (!canTransitionOrder(order.status, DeliveryStatus.CANCELLED)) {
      throw new ConflictException('Illegal state transition to CANCELLED');
    }

    const providerOrderIdsToCancel = order.providerOrders
      .filter(
        (po) =>
          po.status !== ProviderOrderStatus.REJECTED_BY_STORE &&
          po.status !== ProviderOrderStatus.CANCELLED,
      )
      .map((po) => po.id);

    const shouldRestoreInventory =
      order.status === DeliveryStatus.CONFIRMED ||
      order.status === DeliveryStatus.READY_FOR_ASSIGNMENT ||
      order.status === DeliveryStatus.ASSIGNED;

    const itemsToRestore = shouldRestoreInventory
      ? order.providerOrders
          .filter((po) => providerOrderIdsToCancel.includes(po.id))
          .flatMap((po) =>
            po.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
            })),
          )
      : [];

    const updated = await this.orderRepository.cancelWithInventoryRestore(
      id,
      providerOrderIdsToCancel,
      itemsToRestore,
    );

    const cancelledEvent: OrderCancelledEvent = {
      type: 'order.cancelled',
      orderId: id,
      occurredAt: new Date(),
    };
    this.eventEmitter.emit('order.stateChanged', cancelledEvent);
    this.logStructuredEvent(
      'order.state_transition',
      { orderId: id },
      'Order cancelled',
    );

    return updated;
  }
}
