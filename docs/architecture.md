# Architecture Overview

## Purpose

Mecerka is a city-scoped local-commerce marketplace that connects `CLIENT`, `PROVIDER`, `RUNNER`, and `ADMIN` through a localized Next.js frontend and a NestJS backend.

The current implementation is not a mock split into separate apps for demo and production. It is one application, one API, and one codebase, deployed into isolated environments with different data, secrets, and runtime configuration.

## Real implementation stack

- Next.js App Router frontend
- NestJS modular monolith backend
- Prisma ORM / Prisma Client
- PostgreSQL as the operational database
- Docker Compose for local and production-style orchestration
- Stripe / Stripe Connect for payment orchestration
- Nodemailer for email transport
- Mailpit locally, external SMTP in deployed environments

## Architectural style

The backend is a modular monolith organized around business capabilities.

It is accurate to describe the implementation as DDD-inspired, but not as full tactical DDD. What is verifiable in code is:

- thin controllers for HTTP and WebSocket transport
- DTO-based validation and guard chains
- services as the main location for invariants and orchestration
- Prisma as the single persistence layer

## Verified runtime architecture

The application depends on PostgreSQL through `DATABASE_URL`. If the database is unavailable, the backend cannot complete normal startup.

This is visible in:

- the Prisma datasource configuration
- `PrismaService`
- startup and migration behavior in the deployed stacks

## Containerized execution model

The repository includes:

- local Docker Compose orchestration
- dual-environment deployment orchestration
- backend and frontend Dockerfiles

The local stack includes:

- `postgres`
- `backend`
- `frontend`
- `mailpit`

The deployed model uses:

- one backend image
- one frontend image
- isolated `prod` and `demo` stacks
- Nginx as reverse proxy with TLS

## Layered structure

### Frontend

The frontend is responsible for:

- localized routing under `app/[locale]`
- role-aware navigation and protected routes
- catalog browsing
- cart, checkout, orders, payments, and tracking UX
- support, finance, and admin backoffice surfaces

### Controllers

NestJS controllers handle:

- routing
- DTO binding
- validation
- guard application
- transport concerns

Business rules are intentionally not concentrated in controllers.

### Services

The main invariants live in services such as:

- `AuthService`
- `UsersService`
- `RoleAssignmentService`
- `OrdersService`
- `PaymentsService`
- `DeliveryService`
- `RefundsService`
- `AdminService`
- `EmailSettingsService`

This is where the project enforces:

- ownership checks
- transactional boundaries
- role-assignment invariants
- order / delivery / payment state transitions
- refund and incident boundaries
- admin-governed SMTP configuration

### Persistence

Prisma is used as a persistence and query layer, not as a business-rules engine.

Important persistence concepts in the current model include:

- `User`
- `RunnerProfile`
- `Provider`
- `Order`
- `ProviderOrder`
- `DeliveryOrder`
- `DeliveryIncident`
- `RefundRequest`
- `GovernanceAuditEntry`
- `SystemSetting`
- `ProviderPaymentSession`
- `StockReservation`

## Request flow

Typical request flow remains:

1. browser sends request
2. controller receives request
3. guards validate authentication, MFA, and roles
4. DTO validation constrains input
5. service applies business rules
6. Prisma reads or writes PostgreSQL state
7. structured response is returned

The dominant backend flow is still:

`browser -> controller -> service -> Prisma -> PostgreSQL`

## Demo and production model

The deployed architecture uses the same application for:

- `https://mecerka.me`
- `https://demo.mecerka.me`

The correct differences are:

- database
- secrets
- runtime-config
- demo dataset
- Stripe mode

The application logic is the same.

## Email / SMTP configuration model

The mail subsystem is no longer purely environment-driven.

The effective transport configuration now resolves in this order:

1. persisted admin configuration in `SystemSetting`
2. environment variables
3. local default transport (`mailpit:1025`)

This gives the project a better self-hosting/operator model while preserving infrastructure-managed configuration as fallback.

## Security-relevant architecture points

Security is enforced through:

- `JwtAuthGuard`
- `MfaCompleteGuard`
- `RolesGuard`
- DTO validation
- service-level ownership checks
- transactional role-assignment logic
- structured logging with redaction

The application does not rely on frontend-only checks for protection.

## Seeding architecture

### Base seed

Base seed runs automatically and ensures structural marketplace data exists:

- cities
- categories

### Demo seed

Demo seed is separate and requires `DEMO_MODE=true`.

It creates demo-operational data such as:

- demo users
- demo products
- demo orders
- demo deliveries
- demo support cases

Demo mode is opt-in and disabled by default.

## Real limitations

- the system is modular and domain-oriented, but not full tactical DDD
- fiscal validation is local-format validation and minimization, not external fiscal verification
- secrets are not backed by an external secret manager such as Vault
- persisted SMTP secrets are operationally useful, but still a candidate for stronger encryption at rest
