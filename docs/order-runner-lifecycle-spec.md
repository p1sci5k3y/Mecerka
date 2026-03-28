# Order Runner Lifecycle Atom Spec

## Objetivo

Extract runner-controlled root-order lifecycle transitions from `OrderStatusService` into a dedicated class without changing the public contract or emitted events.

## Alcance

This atom covers only:

- runner acceptance of orders
- runner transition to `IN_TRANSIT`
- runner completion to `DELIVERED`

## Fuera de alcance

This atom does not change:

- provider-order state transitions
- evaluation of `READY_FOR_ASSIGNMENT`
- client/admin order cancellation
- risk event integration

## Contrato público

The following `OrderStatusService` methods must keep their current signatures and behavior:

- `acceptOrder(id, runnerId)`
- `markInTransit(id, runnerId)`
- `completeOrder(id, runnerId)`

## Invariantes

- only active runners with a Stripe account can accept orders
- only orders in `READY_FOR_ASSIGNMENT` can be accepted
- only the assigned runner can mark an order `IN_TRANSIT`
- all active provider orders must be `PICKED_UP` before `IN_TRANSIT`
- only orders in `IN_TRANSIT` can be completed
- optimistic concurrency failures keep the same error behavior
- the same `order.stateChanged` events are emitted

## Restricciones de diseño

- `OrderStatusService` remains the façade used by `OrdersService`
- runner lifecycle logic moves to a dedicated class under `backend/src/orders`
- no schema changes
- no API payload changes
- no business feature changes

## Criterios de aceptación

- `OrderStatusService` delegates runner lifecycle transitions to a dedicated class
- a focused runner-lifecycle spec covers acceptance, in-transit checks and completion
- backend lint passes
- backend type-check passes
