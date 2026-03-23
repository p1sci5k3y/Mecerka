# Cart Product Pricing Spec

## Goal

Extract active product lookup and cart snapshot pricing from `CartService`
into a dedicated service without changing cart mutation behavior.

## Scope

This vertical owns:

- product availability lookup for cart operations
- provider/city metadata needed by cart mutations
- client-specific discount lookup
- applied discount resolution
- effective unit price calculation
- snapshot payload construction for cart items

## Non-goals

- cart group lifecycle
- cart provider lifecycle
- cart item persistence
- cart subtotal recalculation

## Invariants

- only active products from active providers with connected Stripe accounts are eligible
- the lowest valid discount between public and client-specific discount wins
- snapshot fields remain consistent between add and quantity-update flows
- unavailable products still raise `Product not available`

## Acceptance criteria

- `CartService` delegates product pricing snapshot resolution
- add/update cart flows keep the same observable behavior
- targeted pricing specs pass
- existing `CartService` specs continue to pass
