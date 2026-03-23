# Product Client Discount Spec

## Goal

Extract provider-managed client-specific product discounts from `ProductsService`
into a dedicated service without changing observable controller behavior.

## Scope

This vertical owns:

- product ownership validation for discount management
- target client validation
- listing provider discounts for a product
- upserting a provider/client/product discount
- partially updating an existing discount
- response mapping for discount read models

## Non-goals

- product catalog reads
- product CRUD
- stock availability enrichment
- catalog import workflow

## Invariants

- only the owning provider can manage discounts for a product
- the target user must exist, be active, and have the `CLIENT` role
- the client-specific discount price must remain valid against product price
- partial updates keep the existing price when no new discount price is supplied
- response payload shape stays unchanged

## Acceptance criteria

- `ProductsService` delegates discount operations to a dedicated service
- controller contracts remain unchanged
- targeted discount specs pass
- existing `ProductsService` specs continue to pass
