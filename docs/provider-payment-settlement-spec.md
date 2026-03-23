# Provider Payment Settlement Spec

## Goal

Extract provider-payment settlement from
`ProviderPaymentConfirmationService` into a dedicated service without changing
webhook confirmation behavior.

## Scope

This vertical owns:

- locking the root order and affected products after payment validation
- consuming active reservations
- decrementing stock atomically
- marking the payment session as completed
- marking the provider order as paid
- confirming the root order when all provider orders are paid

## Non-goals

- loading the payment session
- loading the provider order
- Stripe connected-account resolution
- webhook payload validation

## Invariants

- all active reservations must be consumed together
- stock updates must fail on concurrent underflow
- root order only moves to `CONFIRMED` when all provider orders are paid
- return payload shape remains unchanged

## Acceptance criteria

- `ProviderPaymentConfirmationService` delegates settlement to a dedicated service
- observable success and conflict behavior remains unchanged
- targeted settlement specs pass
- existing provider payment confirmation specs continue to pass
