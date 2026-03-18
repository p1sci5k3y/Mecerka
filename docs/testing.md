# Testing Strategy

## Overview

The project uses a layered testing strategy:

- unit and service tests for local business rules;
- HTTP integration tests against a real Nest application;
- concurrency tests against a real PostgreSQL instance;
- frontend end-to-end tests with Playwright against the live stack.

The goal is not only coverage, but **reproducibility under real execution conditions**.

## Backend testing model

### Real infrastructure for backend tests

The backend test environment uses **Testcontainers**.

For each run:

- a fresh PostgreSQL container is started;
- `DATABASE_URL` is generated dynamically;
- JWT secrets and `FISCAL_PEPPER` are generated dynamically;
- Prisma migrations are applied automatically;
- teardown removes containers and temporary state.

This means backend tests do **not** require a shared local PostgreSQL instance and do **not** depend on host-specific database credentials.

This approach approximates production behavior and eliminates environment drift.

### Email behavior in tests

Backend tests do not depend on Mailpit or any external SMTP service.

When `NODE_ENV=test` or `E2E=true`, the email transport switches to Nodemailer `jsonTransport`. This preserves the application flow without introducing external infrastructure coupling.

## What the backend tests validate

The backend suite validates:

- registration and login behavior;
- DTO validation and mass-assignment rejection;
- role escalation flow for `PROVIDER` and `RUNNER`;
- absence of privileged self-assignment for `ADMIN`;
- privacy and response-shape guarantees;
- RBAC and ownership checks;
- payment and webhook behavior in critical paths;
- request logging and error behavior;
- concurrency control for privileged role assignment.

## Concurrency testing

Critical concurrency scenarios are tested against a real PostgreSQL instance, not mocked persistence.

Current concurrency coverage includes:

- duplicate concurrent privileged role requests;
- mixed concurrent role requests;
- validation that no duplicate roles are created;
- validation that request state remains consistent;
- validation that `RUNNER` assignment creates `runnerProfile`.

## Backend commands

From the backend workspace:

```bash
npm run lint
npm run type-check
npm run test
npm run test:e2e
```

From the repository root:

```bash
npm run test:ci
```

The root `test:ci` command runs:

- lint
- type-check
- unit/service tests
- backend e2e tests

## Frontend / Playwright

The frontend uses Playwright to exercise user journeys on the live stack.

These tests run against:

- real frontend
- real backend
- real PostgreSQL through Docker

The Playwright suite is intended to validate:

- authentication flows;
- user browsing and ordering;
- provider catalog operations;
- runner order lifecycle;
- admin supervision flows.

## Full-stack E2E execution

Recommended command:

```bash
cd frontend
npm run test:e2e:full
```

This flow expects the real stack to be reachable and may rely on demo data only if demo mode has been explicitly enabled.

## What is intentionally not claimed

The repository should not claim:

- global idempotency across the entire platform;
- perfect coverage of every route;
- full zero-dependency E2E in the browser layer.

The accurate claim is that the project has **strong automated validation of its critical backend security, privacy, and concurrency behavior**, and that these validations run in an isolated and reproducible environment.
