// Eventos de dominio tipados para Order
export interface OrderPlacedEvent {
  readonly type: 'order.placed';
  readonly orderId: string;
  readonly clientId: string;
  readonly totalAmount: number;
  readonly currency: string;
  readonly occurredAt: Date;
}

export interface OrderConfirmedEvent {
  readonly type: 'order.confirmed';
  readonly orderId: string;
  readonly providerId: string;
  readonly occurredAt: Date;
}

export interface OrderCancelledEvent {
  readonly type: 'order.cancelled';
  readonly orderId: string;
  readonly reason?: string;
  readonly occurredAt: Date;
}

export interface OrderInTransitEvent {
  readonly type: 'order.in_transit';
  readonly orderId: string;
  readonly driverId?: string;
  readonly occurredAt: Date;
}

export interface OrderDeliveredEvent {
  readonly type: 'order.delivered';
  readonly orderId: string;
  readonly occurredAt: Date;
}

export type OrderDomainEvent =
  | OrderPlacedEvent
  | OrderConfirmedEvent
  | OrderCancelledEvent
  | OrderInTransitEvent
  | OrderDeliveredEvent;

// Type guard helpers
export const isOrderPlaced = (e: OrderDomainEvent): e is OrderPlacedEvent =>
  e.type === 'order.placed';
export const isOrderConfirmed = (
  e: OrderDomainEvent,
): e is OrderConfirmedEvent => e.type === 'order.confirmed';
export const isOrderCancelled = (
  e: OrderDomainEvent,
): e is OrderCancelledEvent => e.type === 'order.cancelled';
