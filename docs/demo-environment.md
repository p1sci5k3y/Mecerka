# Entorno Demo

## Propósito

The demo environment allows evaluators to exercise the real platform with reproducible sample data. It is not a separate fake frontend: it is the same application and API, isolated by data and runtime config.

## Demo mode is opt-in

`DEMO_MODE` is disabled by default in the shipped configuration.

To enable demo mode locally:

```env
DEMO_MODE=true
DEMO_PASSWORD=choose-a-demo-password
```

`DEMO_PASSWORD` is mandatory when demo mode is enabled.

## Data seeding strategy

### Base seed

Always runs and ensures structural data exists:

- cities
- categories

### Demo seed

Runs only when `DEMO_MODE=true`.

It creates:

- demo users
- demo products
- demo orders
- demo deliveries
- demo support/refund scenarios

## Demo endpoints

- `POST /demo/seed`
- `POST /demo/reset`
- demo payment confirmation endpoints for provider and runner

These routes are protected by:

- JWT authentication
- MFA completion
- admin role

## Demo users

The demo dataset includes:

- `admin.demo@local.test`
- `provider.demo@local.test`
- `provider2.demo@local.test`
- `runner.demo@local.test`
- `runner2.demo@local.test`
- `user.demo@local.test`
- `user2.demo@local.test`

All demo users share `DEMO_PASSWORD`.

## Validated public-demo behavior

At `28/03/2026`, the public demo is observable with:

- login working for `CLIENT`, `PROVIDER`, `RUNNER`, `ADMIN`
- `CLIENT` access to orders, payments, track, incidents, and refunds
- `PROVIDER` and `RUNNER` access to operational and finance hubs
- `ADMIN` access to users, refunds, incidents, and email settings

Important nuance:

- `PROVIDER` and `RUNNER` support is currently stronger in contextual hubs (`provider/support`, `runner/support`, order/delivery detail) than in role-global `/me` endpoints
- this is a valid product state, but not yet a unified support inbox for those roles

## Security considerations

> [!CAUTION]
> `DEMO_MODE` must never be enabled on a real production tenant with live users or live business data.

- `DEMO_PASSWORD` is mandatory
- demo passwords should still be strong
- in cloud deployments, `DEMO_PASSWORD` must come from secrets, never from committed source
