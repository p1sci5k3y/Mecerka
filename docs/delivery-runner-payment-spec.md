# Delivery Runner Payment Atom Spec

## Goal

Extract runner payment handling from `DeliveryService` into a dedicated class without changing the public HTTP contract or observable behavior.

## Scope

This atom covers only:

- runner payment preparation
- runner payment success confirmation
- runner payment failure handling
- Stripe client resolution for runner payments
- runner payment webhook claim/update bookkeeping

## Out of Scope

This atom does not change:

- delivery lifecycle transitions
- delivery tracking
- delivery incidents
- delivery job dispatch
- runner assignment
- controller routes or DTOs

## Public Contract

The following `DeliveryService` methods must keep their current signatures and behavior:

- `prepareRunnerPayment(deliveryOrderId, userId, roles)`
- `confirmRunnerPayment(externalSessionId, eventId?)`
- `failRunnerPayment(externalSessionId, eventId?)`

## Invariants

- runner payment preparation remains restricted to the client owner or an admin
- runner payment can only be prepared for eligible delivery states
- already paid delivery orders remain non-payable
- active, non-expired ready sessions are reused
- expired sessions are marked as expired before creating a replacement
- successful payment confirmation marks the runner payment as paid
- failed payment confirmation marks the runner payment as failed
- webhook idempotency remains enforced by `runnerWebhookEvent`
- payment failure still emits the same client risk event

## Design Constraints

- `DeliveryService` remains the application façade used by the controller
- runner payment logic moves to a dedicated class under `backend/src/delivery`
- no API payload shape changes
- no database schema changes
- no business feature changes

## Acceptance Criteria

- `DeliveryService` delegates runner payment handling to a dedicated class
- existing runner payment tests keep passing
- a focused runner payment service spec covers the extracted behavior
- backend lint passes
- backend type-check passes
