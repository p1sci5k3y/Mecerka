# Modelo De Seguridad

## Alcance

This document describes the security controls that are actually implemented in the backend. It does not claim absolute security; it explains the mechanisms that can be verified in code and tests.

## Autenticación

The backend uses JWT-based authentication with NestJS guards.

Implemented controls:

- password hashing with Argon2;
- email verification before login;
- token invalidation through `tokenVersion`;
- MFA support with a dedicated completion guard.
- cookie-based session handling with HttpOnly cookies in the app integration.

### JWT validation model

The backend signs tokens with `JWT_SECRET`.

Validation accepts:

- `JWT_SECRET_CURRENT`
- optionally `JWT_SECRET_PREVIOUS`

This supports controlled secret rotation by configuration. It is a practical rotation model, not a centralized key-management platform.

## Autorización

Authorization is implemented in layers:

1. **JWT authentication**
2. **MFA completion checks** for sensitive routes
3. **RBAC** through `RolesGuard` and `@Roles(...)`
4. **Ownership checks inside services**

The RBAC model alone is not treated as sufficient. For example:

- users can only read their own orders unless they are the assigned runner, the involved provider, or an admin;
- providers can manage only their own products and provider orders;
- runners can act only on assigned deliveries;
- admin-only routes are guarded explicitly, including `/metrics`, observability, risk, and demo endpoints.

This is why the correct security claim is **RBAC plus resource ownership validation**, not RBAC in isolation.

## Role model

The implemented roles are:

- `CLIENT`
- `PROVIDER`
- `RUNNER`
- `ADMIN`

The public registration flow always creates `CLIENT`.

The endpoint `POST /auth/register` does not permit public assignment of privileged roles, and `ADMIN` cannot be self-requested.

## Privileged role escalation

Privileged role acquisition is explicit and controlled.

### Public flow

`POST /users/request-role`

Requires:

- authenticated user;
- MFA completed;
- requested role in `{PROVIDER, RUNNER}`;
- `country`;
- `fiscalId`.

This flow:

- rejects `ADMIN`;
- validates the fiscal identifier format locally for Spanish identifiers;
- applies a cooldown window between privileged requests;
- executes assignment in a transaction with row-level locking.

### Administrative overrides

Administrative role grants are not hidden or ad hoc. They remain available, but they reuse the same internal role-assignment logic and preserve the same critical invariants.

This means:

- no blind role array append;
- `RUNNER` assignment creates `runnerProfile`;
- audit snapshot fields remain coherent;
- admin grants are marked with their own audit source.

## DTO validation and mass-assignment protection

Global validation is enabled with:

- `whitelist: true`
- `forbidNonWhitelisted: true`
- `transform: true`

Sensitive routes use DTOs rather than inline plain object bodies, including admin city and category mutation routes.

This prevents the API from trusting arbitrary client fields such as:

- roles
- role status
- fiscal metadata
- nested persistence-like payloads

## Privacy and fiscal data

### Data minimization

Fiscal identifiers are not collected during normal user registration.

They are requested only when a user explicitly asks for `PROVIDER` or `RUNNER`.

### Storage model

The raw `fiscalId` is not persisted.

The backend stores:

- `fiscalIdHash`
- `fiscalIdLast4`
- `fiscalCountry`

The hash is computed as **HMAC-SHA256** using `FISCAL_PEPPER`.

### Real limitation

The implementation performs format validation for Spanish identifiers (`NIF`, `NIE`, `CIF`) when `country = ES`.

It does **not** perform external validation against government or tax registries.

## Logging and secret hygiene

The backend uses a structured logger with recursive redaction for sensitive fields, including:

- passwords
- tokens
- JWT values
- cookies
- `fiscalId`
- `fiscalCountry`
- `fiscalIdHash`
- `fiscalIdLast4`

The logger is therefore designed to reduce accidental disclosure in operational traces.

## Operational email configuration

The project now supports admin-managed SMTP configuration persisted in the database, in addition to environment-based configuration.

This improves self-hosting ergonomics, but also creates a clear next hardening target:

- persisted SMTP credentials should be treated as application secrets and strengthened with encryption at rest.

## Payment security

Critical payment flows are protected through:

- Stripe webhook signature verification;
- raw request body usage for signature validation;
- metadata validation;
- payment amount and currency checks;
- controlled payment-session processing;
- idempotency safeguards in critical webhook/payment paths.

This should be described as **critical-flow protection**, not universal idempotency across the entire system.

## Rate limiting

The application uses Nest Throttler globally and adds endpoint-level throttles to sensitive authentication routes such as:

- `/auth/register`
- `/auth/login`
- `/auth/resend-verification`
- `/auth/forgot-password`

## Demo and non-production isolation

Demo accounts use reserved non-production domains such as:

- `@local.test`
- `@example.test`

`DEMO_MODE` is disabled by default and must be enabled intentionally. Demo endpoints are admin-protected and only become operational when demo mode is explicitly activated.

## What is not claimed

This project should not claim:

- full zero-trust architecture;
- external fiscal verification;
- complete elimination of all authorization risk by RBAC alone;
- full tactical DDD security modeling.

The defensible claim is that the system implements **concrete, layered, code-verifiable security controls appropriate for a production-grade MVP**.
