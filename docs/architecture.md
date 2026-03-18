# Architecture Overview

## Purpose

Mecerka is a city-based local-commerce marketplace that connects customers, providers, runners, and administrators through a web frontend and a NestJS backend.

The real implementation uses:

- Next.js frontend
- NestJS backend
- Prisma as ORM / database client
- PostgreSQL as the operational database
- Docker Compose for local and production-style container orchestration
- Stripe for payment integration

## Architectural style

The backend is a **modular monolith** organized around business capabilities.

It is accurate to describe the implementation as **DDD-inspired**, but not as full tactical DDD. The codebase does not rely on rich domain entities isolated from infrastructure; instead, it uses:

- thin controllers for transport concerns;
- services for business orchestration and invariant enforcement;
- Prisma as the persistence layer.

## Verified runtime architecture

The backend depends explicitly on PostgreSQL through `DATABASE_URL`.

This is visible in:

- Prisma datasource configuration in `schema.prisma`
- `PrismaService` startup connection behavior

If PostgreSQL is unavailable, the backend cannot complete normal startup.

## Containerized execution model

The repository includes:

- local Docker Compose orchestration
- production-style Docker Compose orchestration
- backend and frontend Dockerfiles

The local stack includes:

- `postgres`
- `backend`
- `frontend`
- `mailpit`

The production-style stack includes:

- `postgres`
- `backend`
- `frontend`

In both cases, runtime configuration is externalized through `.env`.

## Layered structure

### Frontend

The frontend is responsible for:

- authentication UX
- role-aware navigation and dashboards
- catalog browsing
- cart and checkout interfaces
- admin views
- Playwright-based browser validation

### Controllers

NestJS controllers define HTTP contracts and handle:

- routing
- DTO binding
- validation
- guard application
- serialization / transport concerns

Business rules are intentionally not concentrated in controllers.

### Services

The main business invariants live in Nest services, for example:

- `AuthService`
- `UsersService`
- `RoleAssignmentService`
- `OrdersService`
- `PaymentsService`
- `DeliveryService`
- `AdminService`

This is where the project enforces:

- ownership checks
- transactional boundaries
- role-assignment invariants
- payment and delivery state transitions

### Persistence

Prisma is used as a persistence and query layer, not as a business-rules engine.

Important persistence concepts in the current model include:

- `User`
- `Provider`
- `RunnerProfile`
- `Order`
- `ProviderOrder`
- `ProviderPaymentSession`
- `DeliveryOrder`
- `StockReservation`

## Request flow

Typical HTTP flow:

1. client sends request
2. controller receives request
3. guards validate authentication, MFA, and roles
4. DTO validation transforms and constrains input
5. service applies business logic
6. Prisma reads or writes PostgreSQL state
7. structured response is returned

The dominant backend flow is therefore:

`client -> controller -> service -> Prisma -> PostgreSQL`

## Security-relevant architecture points

The implementation does not rely on obscurity or frontend behavior for protection.

Security is enforced through:

- guard chains (`JwtAuthGuard`, `MfaCompleteGuard`, `RolesGuard`)
- DTO validation
- service-level ownership checks
- transactional role-assignment logic
- structured logging with redaction

## Seeding architecture

### Base seed

Base seed runs automatically on backend startup in every environment.

Its purpose is to ensure structural marketplace data exists:

- cities
- categories

### Demo seed

Demo seed is separate from base seed and requires `DEMO_MODE=true`.

It creates demo-operational data such as:

- demo users
- demo products
- demo orders
- demo deliveries

Demo mode is **opt-in and disabled by default**.

## Limitaciones del sistema

- La arquitectura es modular y orientada al dominio, pero **no** implementa DDD táctico completo.
- La validación fiscal es de formato y minimización; **no** existe verificación fiscal externa.
- La idempotencia está reforzada en flujos críticos, pero **no** se formaliza como garantía global para todo el sistema.
- El sistema aplica capas de seguridad reales, pero **no** implementa una arquitectura zero-trust completa.
- Los secretos se gestionan mediante variables de entorno y bootstrap seguro; **no** existe integración con un gestor externo tipo Vault.
