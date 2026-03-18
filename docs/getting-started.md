# Getting Started

This guide reflects the current implementation and the shipped repository defaults.

## 1. Prerequisites

- Docker and Docker Compose
- Node.js if you want to run linting or tests outside containers

## 2. Bootstrap the local environment

Generate a local `.env` file with secure random secrets:

```bash
make setup
```

This uses `scripts/bootstrap-env.sh`, which:

- creates `.env` only if it does not already exist;
- generates secrets using `openssl rand`;
- initializes `JWT_SECRET` and `JWT_SECRET_CURRENT` consistently;
- generates `FISCAL_PEPPER`;
- sets `DEMO_MODE=false` by default.

The repository is therefore safe by default with respect to demo mode: **demo mode is opt-in and disabled by default**.

## 3. Start the platform

```bash
docker compose up -d --build
```

This starts:

- PostgreSQL
- backend API
- frontend
- Mailpit for local email inspection

## 4. Verify backend health

```bash
curl -fsS http://localhost:3000/health
```

Expected structure:

```json
{
  "status": "ok",
  "services": {
    "database": "ok",
    "api": "ok"
  }
}
```

## 5. Open the application

- frontend: `http://localhost:3001`
- backend: `http://localhost:3000`
- Mailpit: `http://localhost:8025`

## 6. Enable demo mode only if needed

The shipped configuration does **not** enable demo mode automatically.

If you want the demo dataset and demo endpoints:

1. edit `.env`
2. set:

```env
DEMO_MODE=true
```

3. restart the stack:

```bash
docker compose up -d --build
```

When enabled, the demo module may auto-seed demo users, products, and orders, and the admin-only endpoints `/demo/seed` and `/demo/reset` become usable.

## 7. Backend quality checks

```bash
cd backend
npm run lint
npm run type-check
npm run test
npm run test:e2e
```

For the full local quality gate:

```bash
cd /path/to/repo
npm run test:ci
```

## 8. Notes on email behavior

- In normal local Docker execution, Mailpit is available for email inspection.
- In backend `test` / `E2E` execution, Nodemailer uses `jsonTransport`, so tests do not depend on external SMTP availability.

## 9. Production deployment

Production deployment is handled by [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) against [`docker-compose.prod.yml`](../docker-compose.prod.yml).

The deployment flow validates required environment variables before writing `.env`, keeps secrets externalized, uses restrictive file permissions, and is safe to run repeatedly on the same host.
