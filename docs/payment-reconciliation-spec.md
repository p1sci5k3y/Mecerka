# Payment Reconciliation Atom Spec

## Objetivo

Extract payment reconciliation issue detection from `PaymentsService` into a dedicated class without changing the public service contract or the returned payload.

## Alcance

This atom covers only:

- detection of paid provider orders whose root order is still pending
- detection of active provider payment sessions attached to expired reservations
- detection of stale received webhook events
- detection of provider orders with multiple open payment sessions

## Fuera de alcance

This atom does not change:

- Stripe onboarding
- provider payment session preparation
- webhook confirmation
- legacy tripartite or cash wrappers

## Contrato público

The following `PaymentsService` method must keep its current signature and behavior:

- `findPaymentReconciliationIssues(now?)`

## Invariantes

- the stale webhook window remains five minutes
- stale webhook detection continues to use status `RECEIVED`
- open sessions still include only `CREATED` and `READY`
- `multipleOpenSessions` still counts provider orders with more than one open session
- the returned payload shape remains unchanged

## Restricciones de diseño

- `PaymentsService` remains the façade used by controllers and admin flows
- reconciliation logic moves to a dedicated class under `backend/src/payments`
- no schema changes
- no behavior changes outside the extracted scope

## Criterios de aceptación

- `PaymentsService` delegates reconciliation issue detection to a dedicated class
- a focused reconciliation service spec covers stale windows and multiple-open-session detection
- backend lint passes
- backend type-check passes
