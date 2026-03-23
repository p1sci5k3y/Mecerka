# Checkout Delivery Planning Atom Spec

## Goal

Extract delivery-address resolution, provider coverage checks, and delivery pricing snapshot construction from `CheckoutService` into a dedicated class without changing the public checkout contract.

## Scope

This atom covers only:

- geocoding of the checkout address
- provider location lookup for delivery coverage
- distance and coverage-limit calculation
- delivery pricing snapshot generation

## Out of Scope

This atom does not change:

- cart validation
- order creation and stock reservations
- idempotency handling
- payment session initialization

## Public Contract

The following `CheckoutService` method must keep its current signature and behavior:

- `checkoutFromCart(clientId, dto, idempotencyKey?)`

## Invariants

- the selected checkout city still scopes the geocoding request
- providers without configured coordinates still block checkout
- providers outside the effective coverage limit still block checkout
- coverage limit remains the minimum of discovery radius, provider radius and optional city maximum
- delivery pricing still uses the farthest provider distance and additional pickup count
- returned pricing fields and precision remain unchanged

## Design Constraints

- `CheckoutService` remains the checkout façade used by `OrdersService`
- delivery planning moves to a dedicated class under `backend/src/orders`
- no schema changes
- no payload shape changes
- no business feature changes

## Acceptance Criteria

- `CheckoutService` delegates delivery planning to a dedicated class
- a focused planning service spec covers coverage validation and delivery pricing
- backend lint passes
- backend type-check passes
