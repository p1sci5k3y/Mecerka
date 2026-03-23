# Delivery Tracking Atom Spec

## Goal

Extract delivery tracking behavior from `DeliveryService` into a dedicated class without changing the public HTTP contract or observable behavior.

## Scope

This atom covers only:

- runner location updates
- delivery tracking reads
- delivery location history reads
- runner location cleanup

## Out of Scope

This atom does not change:

- delivery lifecycle transitions
- delivery incidents
- runner payment preparation
- delivery job dispatch
- controller routes or DTOs

## Public Contract

The following `DeliveryService` methods must keep their current signatures and behavior:

- `updateRunnerLocation(deliveryOrderId, userId, roles, dto)`
- `getDeliveryTracking(deliveryOrderId, userId, roles)`
- `getDeliveryLocationHistory(deliveryOrderId)`
- `cleanupRunnerLocations(now?)`

## Invariants

- only the assigned runner or an admin can advance tracking-sensitive delivery state
- location updates are rejected when the delivery status is not tracking-active
- location updates are rate-limited by the configured minimum interval
- abnormal GPS jumps above the configured threshold are rejected
- tracking visibility remains restricted to:
  - admin
  - assigned runner
  - client, only when delivery visibility rules allow it
- cleanup only removes runner locations older than the configured retention window

## Design Constraints

- `DeliveryService` remains the application façade used by the controller
- tracking logic moves to a dedicated class under `backend/src/delivery`
- no API payload shape changes
- no database schema changes
- no business feature changes

## Acceptance Criteria

- `DeliveryService` delegates the tracking vertical to a dedicated class
- existing delivery tracking tests keep passing
- backend lint passes
- backend type-check passes
