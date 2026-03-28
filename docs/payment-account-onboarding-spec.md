# Payment Account Onboarding Atom Spec

## Objetivo

Extract Stripe connected-account onboarding from `PaymentsService` into a dedicated class without changing the public HTTP contract or observable behavior.

## Alcance

This atom covers only:

- onboarding link generation for provider and runner accounts
- initial Stripe Express account creation when the user has no connected account yet
- post-callback verification of the connected account
- activation of the corresponding `PaymentAccount` record

## Fuera de alcance

This atom does not change:

- provider payment session preparation
- payment confirmation by webhook
- reconciliation
- legacy tripartite or cash wrappers

## Contrato público

The following `PaymentsService` methods must keep their current signatures and behavior:

- `generateOnboardingLink(userId)`
- `verifyAndSaveConnectedAccount(userId, accountId)`

## Invariantes

- onboarding remains available only for existing users
- a new Stripe Express account is created only when the user has no stored `stripeAccountId`
- provider and runner users activate a `PaymentAccount` record after account creation or verification
- client-only users do not activate payout accounts
- verification fails if the callback account does not match the stored `stripeAccountId`
- verification fails while Stripe onboarding is still incomplete
- refresh and return URLs remain derived from the configured frontend/backend URLs

## Restricciones de diseño

- `PaymentsService` remains the application façade used by controllers
- onboarding logic moves to a dedicated class under `backend/src/payments`
- no API payload shape changes
- no database schema changes
- no business feature changes

## Criterios de aceptación

- `PaymentsService` delegates onboarding and account verification to a dedicated class
- existing controller contract remains unchanged
- a focused onboarding service spec covers account creation, link generation, and verification
- backend lint passes
- backend type-check passes
