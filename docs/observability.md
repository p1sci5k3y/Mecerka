# Observabilidad

## Propósito

The observability layer provides operational visibility for debugging, supervision, and academic evaluation. It is intentionally read-only.

## Endpoint de health

`GET /health`

This endpoint is public and returns:

- API status
- uptime
- timestamp
- lightweight database connectivity status

The database check uses a minimal query to verify PostgreSQL availability without loading business entities.

## Endpoint de métricas

`GET /metrics`

This endpoint is **not public**. It is protected with:

- `JwtAuthGuard`
- `MfaCompleteGuard`
- `RolesGuard`
- `@Roles(Role.ADMIN)`

Its purpose is to expose lightweight platform counters to administrators, not to anonymous callers.

## Endpoints de observabilidad admin

The dedicated observability module exposes admin-only endpoints such as:

- `/observability/metrics`
- `/observability/sla`
- `/observability/reconciliation`

These routes remain read-only and do not mutate payments, deliveries, orders, or risk state.

## Logging estructurado

The backend emits structured logs with fields such as:

- `timestamp`
- `level`
- `event`
- `requestId`
- `method`
- `path`
- `statusCode`
- `durationMs`
- `userId`

## Correlación de requests

Every HTTP request receives an `X-Request-ID`. This improves traceability across logs without exposing business secrets.

## Precisión del logging de errores

The request logging interceptor distinguishes successful requests from failed requests and records the effective failure status code.

When the error is an `HttpException`, the logger uses `error.getStatus()` instead of relying on a possibly stale `response.statusCode`.

## Privacidad y redacción de datos

The structured logger redacts sensitive values recursively, including:

- `fiscalId`
- `fiscalCountry`
- `fiscalIdHash`
- `fiscalIdLast4`
- passwords
- tokens
- JWT values
- cookies

The observability surface therefore avoids turning operational tooling into a privacy leak.

## Alcance and limits

The observability layer improves diagnosability and supervision, but it does not replace:

- a full metrics platform;
- centralized tracing infrastructure;
- automated security monitoring;
- SIEM integration.

The correct claim is that the system includes a **lightweight but real operational baseline** appropriate for a production-grade MVP.
