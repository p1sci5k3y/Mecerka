# Dual Deployment: Demo and Production

This repository is prepared to deploy the same build artifact to two isolated environments:

- `mecerka.me` as production
- `demo.mecerka.me` as demo

## Deployment model

- Images are built once per commit in GitHub Actions.
- The workflow publishes one backend image and one frontend image to GHCR, both tagged with the same commit SHA.
- The deploy job checks out the same Git commit on the server and deploys that exact image tag to both stacks.
- The frontend image is environment-agnostic: public runtime values are resolved at container runtime rather than baked into the image build.

## Isolation rules

Demo and production must not share:

- database name
- persistent volume
- Stripe credentials
- mail configuration
- JWT/FISCAL secrets
- demo mode or demo password

Isolation is enforced by:

- two environment files rendered on the server:
  - `deploy/prod.env`
  - `deploy/demo.env`
- two Compose projects:
  - `mecerka-prod`
  - `mecerka-demo`
- separate host ports for the reverse proxy:
  - production: backend `3000`, frontend `3001`
  - demo: backend `3010`, frontend `3011`
- runtime-only frontend configuration:
  - `API_BASE_URL=/api`
  - `STRIPE_PUBLISHABLE_KEY` provided per environment

## Required GitHub secrets / variables

The deploy workflow expects separate values for demo and prod, using prefixes:

- `PROD_*`
- `DEMO_*`

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

## Reverse proxy

`infrastructure/nginx.conf` is configured with two virtual hosts:

- `mecerka.me` and `www.mecerka.me`
- `demo.mecerka.me`

Each host proxies to its own frontend/backend localhost ports.

TLS is managed during deploy with Certbot:

- the deploy ensures `certbot` and DNS tooling are present on the host;
- it checks that `mecerka.me`, `www.mecerka.me` and `demo.mecerka.me` resolve publicly to the same host before attempting certificate changes;
- it issues or renews two certificates with Certbot standalone mode:
  - `mecerka.me` covering `mecerka.me` and `www.mecerka.me`
  - `demo.mecerka.me` covering `demo.mecerka.me`
- after certificate issuance or renewal, the workflow installs the final Nginx config, runs `nginx -t` and reloads Nginx safely.

## Demo reset policy

The GitHub Actions deploy recreates the demo stack from a clean volume on each deployment before bringing it back up.

This keeps `demo.mecerka.me` reproducible and prevents stale or mixed demo data from leaking across releases, while production keeps its own isolated persistent volume.

## Pending external infrastructure

The repository leaves these points prepared but cannot provision them by itself:

- DNS records for `mecerka.me`, `www.mecerka.me` and `demo.mecerka.me`
- GitHub secrets and variables with real environment values
- GHCR credentials with permission to pull images on the server
- optional `GHCR_USERNAME` secret if the pull token belongs to a different GitHub account than the repository owner
