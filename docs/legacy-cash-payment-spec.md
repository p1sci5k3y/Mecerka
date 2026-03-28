# Legacy Cash Payment Atom Spec

## Objetivo

Extract the legacy offline cash flow from `PaymentsService` into a dedicated class without changing the public contract or reviving deprecated behavior.

## Alcance

This atom covers only:

- validation gates for the legacy cash path
- transactional stock deduction for legacy cash confirmation
- root order confirmation and event emission for the legacy cash path

## Fuera de alcance

This atom does not change:

- provider payment session preparation
- onboarding
- webhook confirmation
- reconciliation
- the fact that legacy cash payments remain disabled by default

## Contrato público

The following `PaymentsService` method must keep its current signature and behavior:

- `processCashPayment(orderId, clientId, pin)`

## Invariantes

- the feature stays disabled unless `ENABLE_LEGACY_CASH_PAYMENTS=true`
- the transaction PIN remains mandatory
- the client must own the order
- the legacy path remains restricted to single-provider orders
- insufficient stock still aborts the transaction
- a confirmed cash payment still emits `order.stateChanged`
- the response payload shape remains unchanged

## Restricciones de diseño

- `PaymentsService` remains the façade used by controllers
- legacy cash logic moves to a dedicated class under `backend/src/payments`
- no schema changes
- no new feature behavior

## Criterios de aceptación

- `PaymentsService` delegates legacy cash handling to a dedicated class
- stock deduction is typed without `any`
- focused legacy cash specs cover the success path and stock failure
- backend lint passes
- backend type-check passes
