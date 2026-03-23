# Checkout Order Creation Atom Spec

## Goal

Extract transactional order creation from `CheckoutService` into a dedicated class without changing the public checkout contract or the resulting persisted structure.

## Scope

This atom covers only:

- deterministic product locking for checkout
- stock availability validation before order creation
- creation of the root order and `ProviderOrder[]`
- creation of the order summary document
- transition of the cart group to `CHECKED_OUT`

## Out of Scope

This atom does not change:

- cart validation
- delivery planning
- idempotency handling
- post-creation stock reservation records
- payment session initialization

## Public Contract

The following `CheckoutService` method must keep its current signature and behavior:

- `checkoutFromCart(clientId, dto, idempotencyKey?)`

## Invariants

- checkout still locks products in deterministic order
- checkout still fails when there are no requested products
- stock availability is still checked inside the transaction before order creation
- the root order still stores delivery pricing and address snapshots
- each provider group still becomes a `ProviderOrder`
- each cart item still becomes an order item snapshot
- the order summary document still uses the `SUM-XXXXXXXX` display number format
- the originating cart still ends in `CHECKED_OUT` with incremented version

## Design Constraints

- `CheckoutService` remains the checkout façade used by `OrdersService`
- transactional order creation moves to a dedicated class under `backend/src/orders`
- no schema changes
- no payload shape changes
- no business feature changes

## Acceptance Criteria

- `CheckoutService` delegates transactional order creation to a dedicated class
- a focused order-creation spec covers provider suborder creation and summary/cart side effects
- backend lint passes
- backend type-check passes
