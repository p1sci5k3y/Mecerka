import { DeliveryStatus } from '@prisma/client';

/**
 * Validates whether a requested transition between two DeliveryStatus states is allowed.
 * Strictly adheres to the Monolith Order Saga lifecycle.
 *
 * Flow:
 * PENDING -> CONFIRMED -> READY_FOR_ASSIGNMENT -> ASSIGNED -> IN_TRANSIT -> DELIVERED
 * Any state before DELIVERED can transition to CANCELLED.
 */
export function canTransitionOrder(
  current: DeliveryStatus,
  next: DeliveryStatus,
): boolean {
  // If no state change, it is idempotent, returning true might be dangerous if we want to force mutation,
  // but generally, avoiding unnecessary transitions upstream is better. Strict transition:
  if (current === next) return false;

  const validTransitions: Record<DeliveryStatus, DeliveryStatus[]> = {
    [DeliveryStatus.PENDING]: [
      DeliveryStatus.CONFIRMED,
      DeliveryStatus.CANCELLED,
    ],
    [DeliveryStatus.CONFIRMED]: [
      DeliveryStatus.READY_FOR_ASSIGNMENT,
      DeliveryStatus.CANCELLED,
    ],
    [DeliveryStatus.READY_FOR_ASSIGNMENT]: [
      DeliveryStatus.ASSIGNED,
      DeliveryStatus.CANCELLED,
    ],
    [DeliveryStatus.ASSIGNED]: [
      DeliveryStatus.IN_TRANSIT,
      DeliveryStatus.CANCELLED,
    ],
    [DeliveryStatus.IN_TRANSIT]: [
      DeliveryStatus.DELIVERED,
      DeliveryStatus.CANCELLED,
    ],
    [DeliveryStatus.DELIVERED]: [], // Terminal state
    [DeliveryStatus.CANCELLED]: [], // Terminal state
  };

  const allowedNextStates = validTransitions[current];
  return allowedNextStates ? allowedNextStates.includes(next) : false;
}
