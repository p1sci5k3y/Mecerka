# Delivery Runner Webhook Spec

## Objetivo

Move runner payment webhook processing out of `DeliveryRunnerPaymentService` into
its own service, keeping runner payment preparation focused on session creation.

## Dentro de alcance

- Confirming runner payments from Stripe webhook events.
- Marking runner payment failures from Stripe webhook events.
- Claiming and updating runner webhook audit records.
- Emitting runner payment failure risk events.

## Fuera de alcance

- Preparing runner Stripe payment intents.
- Resolving runner Stripe accounts.
- Delivery tracking or lifecycle operations unrelated to payment webhooks.

## Invariantes

- Public methods exposed through `DeliveryService` remain unchanged.
- Duplicate webhook events remain idempotent.
- Successful payments still promote the delivery to `PICKUP_PENDING` when
  appropriate.
- Failed payments still mark the delivery as failed and emit the same risk
  signal for the client.

## Criterios de aceptación

- `DeliveryRunnerPaymentService` delegates webhook confirmation/failure to a
  dedicated runner webhook service.
- Existing runner payment specs keep passing.
- The webhook audit helpers no longer live in `DeliveryRunnerPaymentService`.
