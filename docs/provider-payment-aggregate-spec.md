# Provider Payment Aggregate Spec

## Goal

Move aggregate provider-payment preparation for a root order out of
`ProviderPaymentPreparationService` into a dedicated service, keeping the
single-provider-order payment preparation focused on one session at a time.

## In Scope

- Loading a root order with its provider orders and runner payment context.
- Building aggregate provider payment state for the order.
- Deciding when provider payment is required, inactive or unavailable in demo.
- Reusing the existing single-provider-order preparation callback.

## Out of Scope

- Preparing a single provider order Stripe payment intent.
- Stripe intent creation/cancellation for individual provider orders.
- Stripe webhook handling.

## Invariants

- Public methods exposed through `PaymentsService` remain unchanged.
- Demo mode still returns `paymentEnvironment: "UNAVAILABLE"` without opening
  Stripe sessions.
- Settled or inactive provider orders remain non-payable in the aggregate
  response.

## Acceptance Criteria

- `ProviderPaymentPreparationService.prepareOrderProviderPayments()` delegates
  to a dedicated aggregate service.
- Existing aggregate payment specs keep passing.
- The aggregate loop and payment-environment logic no longer live in
  `ProviderPaymentPreparationService`.
