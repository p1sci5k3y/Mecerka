# Refund Boundary Resolution Spec

## Objetivo

Extract refund boundary resolution from `RefundBoundaryService` into a dedicated
service without changing refund request behavior.

## Alcance

This vertical owns:

- Stripe connected-account resolution for refund execution
- incident-to-boundary matching
- provider boundary lookup
- delivery boundary lookup
- request boundary resolution from DTO input

## No objetivos

- refund type validation
- currency validation
- access control policy
- refund amount capacity rules
- request rate limits

## Invariantes

- provider and delivery boundaries keep the same shaped read model
- incident matching semantics remain unchanged
- request DTO must still resolve exactly one payment boundary
- connected Stripe account fallback from `user.stripeAccountId` remains unchanged

## Criterios de aceptación

- `RefundBoundaryService` delegates boundary resolution concerns
- observable refund behavior remains unchanged
- targeted resolution specs pass
- existing refund specs continue to pass
