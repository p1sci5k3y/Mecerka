# Checkout Cart Validation Atom Spec

## Goal

Extract active-cart validation from `CheckoutService` into a dedicated class without changing the public checkout contract or the validation outcomes.

## Scope

This atom covers only:

- loading the active cart for the client
- validating cart status and city binding
- validating city availability for checkout
- filtering provider groups without items
- computing the total provider subtotal amount

## Out of Scope

This atom does not change:

- geocoding and delivery planning
- order creation and stock reservation
- idempotency handling
- payment session initialization

## Public Contract

The following `CheckoutService` method must keep its current signature and behavior:

- `checkoutFromCart(clientId, dto, idempotencyKey?)`

## Invariants

- checkout still requires an active cart
- checkout still requires the cart to be in `ACTIVE` status
- checkout still requires the cart city to exist and be active
- checkout still requires DTO city and cart city to match
- provider groups without items are excluded before computing totals
- if every provider group is empty, checkout still fails
- the total amount remains the sum of provider subtotals

## Design Constraints

- `CheckoutService` remains the checkout façade used by `OrdersService`
- cart validation moves to a dedicated class under `backend/src/orders`
- no schema changes
- no payload shape changes
- no business feature changes

## Acceptance Criteria

- `CheckoutService` delegates cart validation to a dedicated class
- a focused cart-validation spec covers the empty cart and city mismatch paths
- backend lint passes
- backend type-check passes
