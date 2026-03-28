# Dual Deployment: Demo and Production

This repository deploys the same application artifact into two isolated environments:

- `mecerka.me` as production
- `demo.mecerka.me` as demo

## Deployment model

- Images are built from the same commit.
- The workflow deploys one backend image and one frontend image.
- The same codebase is used for both stacks.
- Environment-specific behavior is controlled through secrets, runtime config, and data isolation.

## Isolation rules

Demo and production must not share:

- database name
- persistent volume
- Stripe credentials
- mail configuration
- JWT / fiscal secrets
- demo mode
- demo password

Isolation is enforced by:

- two environment files rendered on the server
- two Compose projects
- separate host ports behind Nginx
- runtime-only frontend config under the same host using `"/api"`

## Required GitHub secrets / variables

The deploy workflow expects split values with `PROD_*` and `DEMO_*` prefixes.

Examples:

- `PROD_POSTGRES_PASSWORD`
- `DEMO_POSTGRES_PASSWORD`
- `PROD_STRIPE_SECRET_KEY`
- `DEMO_STRIPE_SECRET_KEY`
- `PROD_MAIL_HOST`
- `DEMO_MAIL_HOST`
- `PROD_BACKEND_URL=https://mecerka.me/api`
- `DEMO_BACKEND_URL=https://demo.mecerka.me/api`
- `PROD_DEMO_MODE=false`
- `DEMO_DEMO_MODE=true`
- `DEMO_DEMO_PASSWORD`

The workflow also needs:

- `EC2_HOST`
- `EC2_USERNAME`
- `EC2_SSH_KEY`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `GHCR_USERNAME`
- `GHCR_TOKEN`
- `LETSENCRYPT_EMAIL`

## Reverse proxy and TLS

`infrastructure/nginx.conf` routes:

- `mecerka.me` and `www.mecerka.me`
- `demo.mecerka.me`

TLS is managed by Certbot during deploy, followed by `nginx -t`, reload, and public smoke checks.

## SMTP operational model

Deployment still supports environment-driven SMTP through `PROD_MAIL_*` and `DEMO_MAIL_*`.

In addition, the app now exposes admin-managed SMTP configuration:

- infrastructure can keep mail fully secret-managed through environment
- self-hosted operators can override SMTP from the admin UI
- the effective source is visible as `environment`, `database`, or `default`

## Demo reset policy

The demo stack is recreated from a clean volume on deploy so that the public demo does not accumulate stale business data between releases.

## Validated current state

At `28/03/2026`, the observable state is:

- `https://mecerka.me/` and `https://mecerka.me/api/health` respond `200`
- `https://demo.mecerka.me/` and `https://demo.mecerka.me/api/health` respond `200`
- `https://demo.mecerka.me/runtime-config` serves `"/api"` and Stripe dummy
- admin demo login reaches `/api/admin/email-settings`
- the SMTP summary is visible and currently resolves from `environment` in the public demo

## Pending external infrastructure

The repository does not provision by itself:

- DNS
- cloud secrets
- GHCR access on the target host
- SMTP provider accounts such as AWS SES
