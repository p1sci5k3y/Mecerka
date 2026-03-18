# Demo Testing Environment

## Purpose of Demo Mode

Demo mode provides a reproducible marketplace dataset so examiners can exercise the platform without manual setup.

It is designed to:

- create coherent users for all core roles
- create demo providers and products with images
- generate sample orders in different lifecycle stages
- allow repeated end-to-end test runs through reset + reseed

The demo environment is isolated to test accounts using `@local.test`.

When demo mode is explicitly enabled, the backend auto-seeds this dataset on startup if the demo records do not already exist.

## Quick Start

1. Start PostgreSQL.
2. Run the backend.
3. Run the frontend.
4. Log in with the demo users below and explore the platform.
5. If you need a clean baseline, authenticate as an admin user and call `POST /demo/reset`.

Example reset flow:

```bash
curl -c cookies.txt -X POST http://127.0.0.1:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin.demo@local.test","password":"<admin-password>"}'

curl -b cookies.txt -X POST http://127.0.0.1:3000/demo/reset
```

`/demo/reset` is admin-only.

## How to Reset the Environment

Available endpoints:

- `POST /demo/seed`
- `POST /demo/reset`

Behavior:

- `POST /demo/seed`
  - creates the demo dataset
  - if demo data already exists, it resets first
- `POST /demo/reset`
  - removes demo-only data for `*@local.test`
  - reseeds automatically
  - returns:

```json
{
  "status": "reset_complete"
}
```

This makes repeated manual testing and Playwright reruns deterministic.

## Test Users

Default demo accounts:

- `admin.demo@local.test`
- `provider.demo@local.test`
- `provider2.demo@local.test`
- `runner.demo@local.test`
- `runner2.demo@local.test`
- `user.demo@local.test`
- `user2.demo@local.test`

The Playwright suite also supports reading these from [`frontend/.env.test`](../frontend/.env.test).

Roles:

- `admin.demo@local.test`: `ADMIN`
- `provider.demo@local.test`: `PROVIDER`
- `provider2.demo@local.test`: `PROVIDER`
- `runner.demo@local.test`: `RUNNER`
- `runner2.demo@local.test`: `RUNNER`
- `user.demo@local.test`: `CLIENT`
- `user2.demo@local.test`: `CLIENT`

## Demo Providers

The seeded provider-facing businesses are:

- `Panadería San Isidro`
- `Verduras del Tajo`

These providers are created through existing domain services and receive demo payment-account bootstrap values so marketplace flows can run in local/demo mode.

## Demo Products

The demo catalog includes:

- `Pan artesano`
- `Empanada gallega`
- `Tomates ecológicos`
- `Huevos camperos`
- `Queso manchego`
- `Aceite de oliva`

Images are served from:

- [`frontend/public/demo-products`](../frontend/public/demo-products)

Each demo product includes:

- name
- price
- provider
- category
- `imageUrl`

## Order Lifecycle in Demo

The demo seed creates at least:

- 1 pending order
- 1 delivering order
- 1 delivered order

Operational characteristics:

- at least one order has a runner assigned
- demo runner locations are seeded for tracking flows
- provider orders are created consistently with existing order/payment logic
- delivery state is represented through the existing delivery domain, not direct database writes to stable commerce flows

Typical states visible during testing:

- pending or payment-ready order
- assigned / delivering order
- delivered order

## Playwright Test Coverage

Current Playwright coverage lives in:

- [`frontend/e2e`](../frontend/e2e)
- [`frontend/tests/e2e`](../frontend/tests/e2e)

Covered journeys:

- Auth
  - demo login
  - invalid login rejection
- User
  - browse products
  - add products to cart
  - create and view orders
  - multi-provider order aggregation
- Provider
  - create product
  - update product
  - review provider orders
  - advance provider-order status
- Runner
  - view assigned deliveries
  - progress delivery lifecycle
- Admin
  - inspect dashboard metrics
  - list users/providers
  - inspect orders through admin-capable flows

The E2E suite resets demo data before tests so each run starts from a known baseline.

Because the demo module writes real application data through existing services, both manual demo runs and Playwright runs require the backend to be connected to the same PostgreSQL-backed application stack used in normal execution.

## Notes

- Demo data is intended for local testing and evaluation only.
- Test identities must use `local.test` or `example.test` domains.
- No real payment credentials, personal emails, or production user data should be used in demo mode.
