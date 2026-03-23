# Provider Payment Preparation Atom Spec

## Goal

Extract provider payment preparation from `PaymentsService` into a dedicated class without changing the public HTTP contract or observable behavior.

## Scope

This atom covers only:

- provider-order payment session preparation
- root-order aggregate provider payment preparation
- demo-mode unavailability handling for provider Stripe sessions

## Out of Scope

This atom does not change:

- provider payment confirmation by webhook
- reconciliation
- onboarding links
- tripartite or legacy payment wrappers

## Public Contract

The following `PaymentsService` methods must keep their current signatures and behavior:

- `prepareProviderOrderPayment(providerOrderId, clientId)`
- `prepareOrderProviderPayments(orderId, clientId)`

## Invariants

- provider payment preparation remains restricted to the owning client
- only eligible provider-order states can open payment preparation
- already paid provider orders remain non-payable
- active stock reservations remain mandatory
- active ready sessions are reused
- expired sessions are marked as expired before regeneration
- provider payment sessions remain scoped to the provider connected account
- demo mode with dummy Stripe credentials still returns aggregate `UNAVAILABLE` state

## Design Constraints

- `PaymentsService` remains the application façade used by controllers
- provider payment preparation moves to a dedicated class under `backend/src/payments`
- no API payload shape changes
- no database schema changes
- no business feature changes

## Acceptance Criteria

- `PaymentsService` delegates provider payment preparation to a dedicated class
- existing payment preparation tests keep passing
- a focused preparation service spec covers the extracted behavior
- backend lint passes
- backend type-check passes
