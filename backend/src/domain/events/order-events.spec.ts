import {
  isOrderCancelled,
  isOrderConfirmed,
  isOrderPlaced,
  type OrderDomainEvent,
} from './index';

describe('order domain events helpers', () => {
  const occurredAt = new Date('2026-03-27T08:00:00.000Z');

  it('narrows placed events through the exported type guards', () => {
    const placed: OrderDomainEvent = {
      type: 'order.placed',
      orderId: 'order-1',
      clientId: 'client-1',
      totalAmount: 25,
      currency: 'EUR',
      occurredAt,
    };

    expect(isOrderPlaced(placed)).toBe(true);
    expect(isOrderConfirmed(placed)).toBe(false);
    expect(isOrderCancelled(placed)).toBe(false);
  });

  it('narrows confirmed and cancelled events through the typed helpers', () => {
    const confirmed: OrderDomainEvent = {
      type: 'order.confirmed',
      orderId: 'order-1',
      providerId: 'provider-1',
      occurredAt,
    };
    const cancelled: OrderDomainEvent = {
      type: 'order.cancelled',
      orderId: 'order-1',
      reason: 'client_cancelled',
      occurredAt,
    };

    expect(isOrderConfirmed(confirmed)).toBe(true);
    expect(isOrderPlaced(confirmed)).toBe(false);
    expect(isOrderCancelled(cancelled)).toBe(true);
  });
});
