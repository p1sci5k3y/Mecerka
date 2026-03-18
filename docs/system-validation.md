# System Validation Report

Date: 2026-03-18  
Workspace: repository root

## Objective

Document the current validation baseline of the implemented system in a way that matches the repository as shipped.

This report focuses on:

- backend execution model
- infrastructure reproducibility
- automated validation
- security/privacy/concurrency checks covered by tests

## Runtime validation model

The platform is designed to be validated in two complementary ways:

### 1. Containerized runtime validation

The application can be executed through Docker Compose with:

```bash
docker compose up -d --build
```

Expected services:

- PostgreSQL
- backend
- frontend
- Mailpit

Baseline runtime validation includes:

- `GET /health`
- frontend reachability
- backend startup with migrations
- base seed execution

If demo mode is intentionally enabled, validation may additionally include:

- demo autoseed
- `/demo/reset`
- demo accounts
- Playwright demo flows

## Automated backend validation

The backend validation pipeline is executed with:

```bash
cd /path/to/repo
npm run test:ci
```

This runs:

- lint
- type-check
- unit/service tests
- backend e2e tests

The current implementation executes backend tests in an isolated environment using:

- Testcontainers
- ephemeral PostgreSQL
- dynamic `DATABASE_URL`
- ephemeral JWT secrets
- ephemeral `FISCAL_PEPPER`
- automatic Prisma migrations

Backend test execution is therefore self-contained and does not depend on:

- a shared developer database
- pre-provisioned local database credentials
- external SMTP infrastructure

## Security and consistency validation covered by tests

The current test baseline validates:

- rejection of mass-assignment payloads;
- registration restricted to `CLIENT`;
- authenticated role-request flow for `PROVIDER` and `RUNNER`;
- rejection of public `ADMIN` assignment;
- privacy of auth and admin responses;
- concurrency safety of privileged role assignment;
- consistency of `RUNNER` with `runnerProfile`;
- admin role grant consistency;
- guarded access to protected routes.

## Observability of validation

During backend test execution, the repository logs:

- PostgreSQL container startup
- readiness checks
- migration execution
- teardown cleanup

This provides reproducibility evidence and reduces environment drift.

## What this report should and should not claim

The correct validation claim is:

> The repository includes reproducible, automated validation of critical backend behavior under isolated infrastructure conditions, plus real containerized runtime support for full-stack execution.

It should **not** claim:

- that every possible browser flow is covered by backend tests;
- that demo mode is enabled by default;
- that validation depends on infrastructure outside the test harness for backend execution.
