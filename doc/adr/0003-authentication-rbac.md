# 3. Initial Authentication Strategy (JWT + RBAC)

Date: 2026-01-25

## Status

Superseded by [ADR 0005: Passwordless Authentication](./0005-passwordless-authentication.md) on 2026-02-18.

## Context

We needed a secure way to identify users and control access to resources based on their roles (Client, Provider, Admin, Runner).

## Decision

We implemented **JWT-based Authentication** with **Role-Based Access Control (RBAC)**.

1.  **Token Strategy**:
    - **Access Token**: JWT (JSON Web Token) containing `sub` (userId) and `role`.
    - **Expiration**: Short-lived (e.g., 1h).
    - **Storage**: Client-side storage (initially localStorage/Context for MVP, moved to HTTP-only cookies in secured plan, but retained in Context for simplicity in current phase).

2.  **Password Hashing**:
    - Algorithm: **Argon2**.
    - **Why**: Resistance to GPU cracking and side-channel attacks. Superior to bcrypt.

3.  **Authorization**:
    - **Guards**: NestJS `JwtAuthGuard` checks token validity. `RolesGuard` checks user role against route metadata (`@Roles(Role.ADMIN)`).

## Consequences

- **Pros**: Stateless authentication (scalable). Granular access control.
- **Cons**: Token revocation is difficult without a blacklist/expiry check. Password management adds security burden (addressed later by Passwordless ADR).
