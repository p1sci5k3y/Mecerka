# Final Audit Report

Date: 2026-03-18  
Workspace: `/Users/machinehead/Documents/TFM`

## Verdict

**PASS WITH MINOR OBSERVATIONS**

## Scope

This close-out audit evaluates the repository as shipped across:

- security controls
- privacy and fiscal-data handling
- concurrency and consistency
- testing and reproducibility
- configuration safety
- deployment readiness

## Verified strengths

### Security

- public registration creates only `CLIENT`
- privileged self-service role escalation is explicit and excludes `ADMIN`
- admin grants reuse the same internal role-assignment invariants
- `/metrics` is admin-protected
- admin mutation routes use DTO validation
- Prisma unique-constraint responses no longer leak internal field metadata
- failed-request logs now reflect real failure codes

### Privacy

- raw fiscal identifiers are not stored
- fiscal protection uses `HMAC-SHA256 + FISCAL_PEPPER`
- auth, user, and admin responses exclude fiscal fields
- structured logging redacts fiscal-related fields recursively

### Concurrency

- privileged role assignment runs inside a transaction
- row-level locking (`SELECT ... FOR UPDATE`) protects concurrent role mutation
- duplicate role insertion is prevented in the implemented runtime path
- `RUNNER` assignment is coupled to `runnerProfile`

### Testing

- backend tests use Testcontainers with isolated PostgreSQL per run
- backend tests do not depend on shared localhost infrastructure
- test secrets are generated dynamically
- email in tests uses `jsonTransport`, so backend test execution does not depend on SMTP
- `npm run test:ci` is green

### DevSecOps

- bootstrap script generates secrets securely with `openssl rand`
- `.env` is not versioned
- Husky enforces:
  - pre-commit: lint + type-check
  - pre-push: test + e2e
- Docker Compose runtime is environment-driven

### Configuration safety

- `DEMO_MODE` is opt-in and disabled by default
- no default credentials remain in shipped source seed paths
- `.env.example` contains placeholders and safe defaults only

## Minor observations

- The architecture is modular and domain-oriented, but not full tactical DDD.
- Fiscal validation is local-format validation only; there is no external registry validation.
- Idempotency protections are strong in critical flows, but should not be described as a universal property of the entire platform.
- Secrets are managed via environment variables and bootstrap scripts rather than a dedicated external secret manager.

## Production-readiness statement

The repository is defendable as a **production-grade MVP** provided that deployment continues to respect:

- environment-based secret management
- `DEMO_MODE=false` unless explicitly required
- controlled administration of privileged roles
- continued execution of the test and Husky quality gates

The correct claim is not “perfectly secure”, but that the repository now presents a coherent, verifiable, and technically mature implementation suitable for academic defense and MVP deployment.
