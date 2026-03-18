# Domain Model

## Core Actors

### User

`User` is the principal identity record.

Roles are stored as an array and may include:

- `CLIENT`
- `PROVIDER`
- `RUNNER`
- `ADMIN`

The user model also stores:

- email and password hash
- MFA state
- transaction PIN
- active flag
- Stripe connected account id

### Provider

`Provider` stores the public merchant profile:

- slug
- business name
- city
- category
- descriptive content
- publication status

Operationally, some commerce relations still use the provider user id as the provider identifier. In practice, the codebase uses both:

- `Provider` as the public merchant profile
- `User` with `PROVIDER` role as the operational commerce identity

This is an important implementation detail when explaining the current aggregate boundaries during academic defense.

### Runner

`RunnerProfile` stores operational runner information:

- base location
- distance radius
- fee settings
- active flag
- rating summary

### City

The platform is city-based. Products, providers, carts, and orders are scoped by city.

### Product

Products belong to a provider user and a city, and include:

- reference
- name
- price / discount price
- stock
- image URL
- category
- active flag

### Order

`Order` is the orchestration container created at checkout.

It contains:

- client
- city
- grouped `ProviderOrder`s
- overall total
- root lifecycle status
- optional delivery metadata

### ProviderOrder

`ProviderOrder` is the provider-level commercial boundary inside an order.

It contains:

- owning provider
- subtotal
- provider-specific items
- payment status
- payment session references
- stock reservations

### OrderItem

`OrderItem` links a purchased product to a provider order with:

- quantity
- snapshot purchase price

### Delivery

Delivery is modeled through `DeliveryOrder`, `DeliveryJob`, and `RunnerLocation`.

`DeliveryOrder` is the delivery fulfillment boundary attached to one root order.

## Relationship Summary

- one `User` may be a `CLIENT`, `PROVIDER`, `RUNNER`, or `ADMIN`
- one provider profile belongs to one user
- one runner profile belongs to one user
- one city has many providers, products, carts, and orders
- one order has many provider orders
- one provider order has many order items
- one provider order has many stock reservations
- one order may have one delivery order
- one delivery order may have one assigned runner

See:

- [Domain Model Diagram](diagrams/domain-model-diagram.md)

## Important Domain Rules

### City Consistency

Orders must not mix products from different cities.

This is enforced at:

- cart level when adding items
- legacy order creation flow

### Product Ownership

Providers can create, update, and delete only their own products.

### Order Access

Users can only read their own orders unless they are:

- the assigned runner
- the involved provider
- an admin

### Delivery Ownership

Runners can only update deliveries assigned to them, unless an admin acts.

### Payment Boundary

Payments are scoped to `ProviderOrder` through `ProviderPaymentSession`.

The platform should never charge against the root `Order` as merchant-of-record logic.

### Inventory Safety

`StockReservation` is created at checkout and consumed when provider payment is confirmed.

This protects the invariant:

`reservation -> stock decrement -> provider order payment`

## Order and Delivery Lifecycles

### Root Order Lifecycle

Typical root order progression:

- `PENDING`
- `CONFIRMED`
- `READY_FOR_ASSIGNMENT`
- `ASSIGNED`
- `IN_TRANSIT`
- `DELIVERED`

### Provider Order Lifecycle

Provider orders progress independently as merchants accept and prepare their own items.

### Delivery Lifecycle

`DeliveryOrder` progresses through:

- `RUNNER_ASSIGNED`
- `PICKUP_PENDING`
- `PICKED_UP`
- `IN_TRANSIT`
- `DELIVERED`

See:

- [Order Flow Sequence](diagrams/order-flow-sequence.md)
