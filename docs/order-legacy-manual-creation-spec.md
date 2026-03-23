# Order Legacy Manual Creation Spec

## Goal

Move the legacy single-provider manual order creation flow out of `OrdersService`
into a dedicated application service without changing observable behavior.

## In Scope

- PIN verification for the legacy manual order flow.
- Product existence, activity, stock, city and connected-account validation.
- Aggregation of duplicate `productId` entries before creating the order.
- Creation of the root order and its single `ProviderOrder`.
- Legacy structured log emission for successful order creation.

## Out of Scope

- Official cart checkout flow.
- Provider payment preparation.
- Reservation expiry.
- Runner lifecycle or delivery orchestration.

## Invariants

- The legacy manual flow still allows only one provider per order.
- Orders with products from multiple cities remain rejected.
- Orders with inactive products, insufficient stock or providers without Stripe
  remain rejected.
- Existing controller/service contracts remain unchanged.

## Acceptance Criteria

- `OrdersService.create()` delegates to a dedicated legacy creation service.
- Existing tests for the legacy manual flow keep passing unchanged.
- Dead private stock-evaluation helpers are removed from `OrdersService`.
