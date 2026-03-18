# Demo Environment

## Purpose

The demo environment allows evaluators to exercise the full platform with reproducible sample data, but it is intentionally separated from the default runtime configuration.

## Demo mode is opt-in

`DEMO_MODE` is **disabled by default** in the shipped configuration.

This means:

- a fresh bootstrap does not enable demo behavior automatically;
- demo auto-seed does not run unless explicitly enabled;
- enabling demo mode is an intentional operator decision.

To enable the demo environment:

```env
DEMO_MODE=true
```

## Data seeding strategy

The system separates:

### Base seed

Always runs on backend startup and ensures structural data exists:

- cities
- categories

Base seed is idempotent and does not create business demo users or demo orders.

### Demo seed

Runs only when `DEMO_MODE=true`.

It creates demo-operational data such as:

- demo users
- demo products
- demo orders
- demo deliveries

The demo module depends on the structural data provided by base seed.

## Demo endpoints

- `POST /demo/seed`
- `POST /demo/reset`

These routes are protected by:

- JWT authentication
- MFA completion
- admin role

The endpoints are not public and are intended for controlled demonstration or reset workflows.

## Automatic demo bootstrap

When demo mode is enabled, the backend may auto-seed the demo dataset on startup if demo data does not already exist.

This behavior is disabled by default because demo mode is not enabled unless explicitly configured.

## Demo users

The demo dataset includes reserved non-production identities such as:

- `admin.demo@local.test`
- `provider.demo@local.test`
- `provider2.demo@local.test`
- `runner.demo@local.test`
- `runner2.demo@local.test`
- `user.demo@local.test`
- `user2.demo@local.test`

These addresses are intentionally restricted to reserved test domains.

## Demo scope

The demo dataset is designed to exercise:

- role-specific login
- provider catalog flows
- user ordering
- runner delivery lifecycle
- admin supervision

## Correct operational interpretation

The correct claim is not “the platform always starts in demo mode”, but:

> The repository provides an optional demo environment that can be enabled explicitly for evaluation, while the default shipped configuration keeps demo features disabled.
