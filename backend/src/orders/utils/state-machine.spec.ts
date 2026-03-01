import { DeliveryStatus } from '@prisma/client';
import { canTransitionOrder } from './state-machine';

describe('State Machine Pure Guard', () => {
  it('Should allow PENDING to CONFIRMED', () => {
    expect(
      canTransitionOrder(DeliveryStatus.PENDING, DeliveryStatus.CONFIRMED),
    ).toBe(true);
  });

  it('Should reject CONFIRMED to PENDING (Backtracking)', () => {
    expect(
      canTransitionOrder(DeliveryStatus.CONFIRMED, DeliveryStatus.PENDING),
    ).toBe(false);
  });

  it('Should allow any active state to CANCELLED', () => {
    expect(
      canTransitionOrder(DeliveryStatus.PENDING, DeliveryStatus.CANCELLED),
    ).toBe(true);
    expect(
      canTransitionOrder(DeliveryStatus.CONFIRMED, DeliveryStatus.CANCELLED),
    ).toBe(true);
    expect(
      canTransitionOrder(
        DeliveryStatus.READY_FOR_ASSIGNMENT,
        DeliveryStatus.CANCELLED,
      ),
    ).toBe(true);
    expect(
      canTransitionOrder(DeliveryStatus.ASSIGNED, DeliveryStatus.CANCELLED),
    ).toBe(true);
    expect(
      canTransitionOrder(DeliveryStatus.IN_TRANSIT, DeliveryStatus.CANCELLED),
    ).toBe(true);
  });

  it('Should reject transitions from terminal states', () => {
    expect(
      canTransitionOrder(DeliveryStatus.CANCELLED, DeliveryStatus.PENDING),
    ).toBe(false);
    expect(
      canTransitionOrder(DeliveryStatus.DELIVERED, DeliveryStatus.CANCELLED),
    ).toBe(false);
  });

  it('Should reject illegal skips (PENDING -> READY_FOR_ASSIGNMENT)', () => {
    expect(
      canTransitionOrder(
        DeliveryStatus.PENDING,
        DeliveryStatus.READY_FOR_ASSIGNMENT,
      ),
    ).toBe(false);
  });
});
