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

/**
 * Validates whether a requested transition between two ProviderOrderStatus states is allowed,
 * and if the role performing the transition has permission for that specific state change.
 */
export function canTransitionProviderOrder(
  current: string,
  next: string,
  role: string, // Accept string to avoid circular dependency with Role enum if not imported, though Role could be imported from @prisma/client
): boolean {
  if (current === next) return false;

  // Expected ProviderOrderStatus values (hardcoded as strings or using Prisma enum)
  const PENDING = 'PENDING';
  const ACCEPTED = 'ACCEPTED';
  const PREPARING = 'PREPARING';
  const READY_FOR_PICKUP = 'READY_FOR_PICKUP';
  const PICKED_UP = 'PICKED_UP';
  const REJECTED_BY_STORE = 'REJECTED_BY_STORE';
  const CANCELLED = 'CANCELLED';

  const validTransitions: Record<string, Record<string, string[]>> = {
    [PENDING]: {
      [ACCEPTED]: ['PROVIDER'],
      [REJECTED_BY_STORE]: ['PROVIDER'],
      [CANCELLED]: ['CLIENT', 'ADMIN'],
    },
    [ACCEPTED]: {
      [PREPARING]: ['PROVIDER'],
      [CANCELLED]: ['ADMIN'],
    },
    [PREPARING]: {
      [READY_FOR_PICKUP]: ['PROVIDER'],
      [CANCELLED]: ['ADMIN'],
    },
    [READY_FOR_PICKUP]: {
      [PICKED_UP]: ['RUNNER'],
      [CANCELLED]: ['ADMIN'],
    },
    [PICKED_UP]: {},
    [REJECTED_BY_STORE]: {},
    [CANCELLED]: {},
  };

  const allowedRoles = validTransitions[current]?.[next];
  return allowedRoles ? allowedRoles.includes(role) : false;
}
