# Refund Read Model Atom Spec

## Goal

Remove `any` from refund read-model code paths in `RefundsService` without changing payloads, access-control behavior or query semantics.

## Scope

This atom covers only:

- refund sanitization
- refund read-access checks
- single-refund retrieval
- provider-order refund listing
- delivery-order refund listing

## Out of Scope

This atom does not change:

- refund request creation
- refund execution
- refund status transitions
- boundary locking or Stripe execution

## Public Contract

The following `RefundsService` methods must keep their current signatures and behavior:

- `getRefund(refundRequestId, userId, roles)`
- `listProviderOrderRefunds(providerOrderId, userId, roles)`
- `listDeliveryOrderRefunds(deliveryOrderId, userId, roles)`

## Invariants

- admins still have read access to every refund
- clients still only read refunds related to their own order or delivery
- providers still only read refunds related to their own provider order
- list endpoints still return sanitized refund payloads
- payload shape remains unchanged

## Design Constraints

- no schema changes
- no query-scope changes
- no API payload changes

## Acceptance Criteria

- `sanitizeRefund` no longer accepts `any`
- `assertReadAccess` no longer accepts `any`
- read/list queries no longer rely on `this.prisma as any`
- backend lint passes
- backend type-check passes
