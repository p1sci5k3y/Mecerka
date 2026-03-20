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
DEMO_PASSWORD=choose-a-demo-password
```

`DEMO_PASSWORD` is mandatory when demo mode is enabled. The backend no longer embeds a default demo password.

For a clean and reproducible local demo reset, the repository provides:

```bash
make demo-reset
```

This command:

- enables `DEMO_MODE=true` locally;
- destroys the local PostgreSQL volume for the default Compose stack;
- rebuilds the stack from scratch;
- verifies backend health;
- verifies that the public catalog is not empty;
- verifies that `user.demo@local.test` can log in with `DEMO_PASSWORD`.

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

In the dual deployment workflow, the demo stack is recreated from a clean volume on each deploy so that the public demo does not accumulate stale or mixed data between releases.

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

All demo users share the password configured through `DEMO_PASSWORD`.

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

## Security considerations

> [!CAUTION]
> **DEMO_MODE must never be enabled in production deployments.** Demo mode bypasses standard onboarding flows, creates shared-password accounts, and exposes reset endpoints that are inappropriate for real user data.

- **DEMO_PASSWORD is mandatory.** If `DEMO_MODE=true` but `DEMO_PASSWORD` is unset or empty, the backend refuses to seed demo users and logs an error. There is no fallback default password.
- **Password quality.** Choose a demo password of at least 12 characters. While demo accounts use test domains (`@local.test`), weak passwords still create risk if the instance is network-accessible.
- **Secrets management.** In CI/CD or cloud deployments, pass `DEMO_PASSWORD` through GitHub Secrets, environment variable injection, or a secrets manager — never commit it to source.

### Authentication protection model

The platform uses cookie-based JWT authentication with the following defences:

- **HttpOnly** — cookie is not accessible to client-side JavaScript
- **SameSite=Lax** — browser does not attach the cookie on cross-origin POST/PATCH/DELETE requests, mitigating CSRF for state-changing operations
- **Secure** — cookie is transmitted only over HTTPS in production (`NODE_ENV=production`)

This posture is considered adequate for the current application architecture. A dedicated CSRF token layer may be added as a defence-in-depth measure in a future hardening pass.
