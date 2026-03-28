# Provider Payment Preparation Atom Spec

## Objetivo

Extract provider payment preparation from `PaymentsService` into a dedicated class without changing the public HTTP contract or observable behavior.

## Alcance

This atom covers only:

- provider-order payment session preparation
- root-order aggregate provider payment preparation
- demo-mode unavailability handling for provider Stripe sessions

## Fuera de alcance

This atom does not change:

- provider payment confirmation by webhook
- reconciliation
- onboarding links
- tripartite or legacy payment wrappers

## Contrato público

The following `PaymentsService` methods must keep their current signatures and behavior:

- `prepareProviderOrderPayment(providerOrderId, clientId)`
- `prepareOrderProviderPayments(orderId, clientId)`

## Invariantes

- provider payment preparation remains restricted to the owning client
- only eligible provider-order states can open payment preparation
- already paid provider orders remain non-payable
- active stock reservations remain mandatory
- active ready sessions are reused
- expired sessions are marked as expired before regeneration
- provider payment sessions remain scoped to the provider connected account
- demo mode with dummy Stripe credentials still returns aggregate `UNAVAILABLE` state

## Restricciones de diseño

- `PaymentsService` remains the application façade used by controllers
- provider payment preparation moves to a dedicated class under `backend/src/payments`
- no API payload shape changes
- no database schema changes
- no business feature changes

## Criterios de aceptación

- `PaymentsService` delegates provider payment preparation to a dedicated class
- existing payment preparation tests keep passing
- a focused preparation service spec covers the extracted behavior
- backend lint passes
- backend type-check passes
