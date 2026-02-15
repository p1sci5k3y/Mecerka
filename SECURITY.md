# Security Policy – Mecerka Marketplace

## Supported Versions

Mecerka follows a rolling-release model.

| Version | Supported |
|----------|------------|
| Latest (main) | ✅ Yes |
| Older versions | ❌ No |

Security updates are only applied to the latest version of the `main` branch.

---

## Reporting a Vulnerability

We follow a **Coordinated Vulnerability Disclosure (CVD)** policy.

If you discover a security vulnerability:

- ❗ Do NOT open a public issue.
- 📩 Report it privately via GitHub Security Advisory (preferred).
- Alternatively contact: security@mecerka.local

### Response Timeline

- Acknowledgment within **48 hours**
- Initial triage within **5 business days**
- Patch timeline depends on severity (see below)

We will keep reporters informed during the remediation process.

---

## Severity Classification

| Severity | Description |
|-----------|------------|
| **Critical** | Authentication bypass, remote code execution, full data exfiltration |
| **High** | Privilege escalation, unauthorized data access |
| **Medium** | Stored/reflected XSS, CSRF misconfiguration |
| **Low** | Minor information disclosure, non-sensitive leaks |

---

## Security Architecture Overview

Mecerka implements the following security controls:

- JWT stored **in memory only** (no localStorage persistence)
- Role-Based Access Control (CLIENT / PROVIDER / ADMIN)
- Database-level multi-tenant isolation via Prisma `where` filtering
- ACID transactional integrity for orders
- TOTP-based Multi-Factor Authentication (RFC 6238)
- Docker container isolation
- No ORM metadata exposure in API responses
- Centralized exception filtering in backend
- Strict TypeScript configuration (no implicit any)

---

## Scope

### In Scope

- Backend (NestJS API)
- Frontend (Next.js App Router)
- Authentication (JWT + MFA)
- Docker configuration
- Prisma schema and database logic
- RBAC authorization guards
- Admin governance endpoints

### Out of Scope

- Third-party library vulnerabilities (unless misconfigured)
- Local development environment issues
- Brute-force login attempts without bypass technique
- Denial-of-service scenarios requiring infrastructure scaling

---

## Email Security

Email functionality is implemented via local SMTP (Mailpit) for development and testing environments.

No external email services (SES, Gmail, etc.) are used in this project environment.

---

## Dependency Management

- Automated vulnerability monitoring via Dependabot
- Manual audits using `npm audit`
- Prisma engine binary targets explicitly configured
- Docker images based on official Alpine builds
- Containers run with non-root users where applicable

---

## Disclosure Policy

We request responsible disclosure.

Public disclosure is permitted only after:

- A fix has been released, or
- 30 days have passed since confirmation (whichever occurs first)

---

## Maintainer Contact

Project Maintainer:  
Mecerka Security Team  

Contact: security@mecerka.local
