# Delivery Runner Webhook Spec

## Goal

Move runner payment webhook processing out of `DeliveryRunnerPaymentService` into
its own service, keeping runner payment preparation focused on session creation.

## In Scope

- Confirming runner payments from Stripe webhook events.
- Marking runner payment failures from Stripe webhook events.
- Claiming and updating runner webhook audit records.
- Emitting runner payment failure risk events.

## Out of Scope

- Preparing runner Stripe payment intents.
- Resolving runner Stripe accounts.
- Delivery tracking or lifecycle operations unrelated to payment webhooks.

## Invariants

- Public methods exposed through `DeliveryService` remain unchanged.
- Duplicate webhook events remain idempotent.
- Successful payments still promote the delivery to `PICKUP_PENDING` when
  appropriate.
- Failed payments still mark the delivery as failed and emit the same risk
  signal for the client.

## Acceptance Criteria

- `DeliveryRunnerPaymentService` delegates webhook confirmation/failure to a
  dedicated runner webhook service.
- Existing runner payment specs keep passing.
- The webhook audit helpers no longer live in `DeliveryRunnerPaymentService`.
