# 1. Technology Stack Selection

Date: 2026-01-15

## Status

Accepted

## Context

We build a marketplace application ("Mecerka") requiring a robust backend for transaction processing and a responsive frontend for users (Clients, Providers, Runners).
Key requirements:
1.  **Type Safety**: End-to-end type safety to reduce runtime errors.
2.  **Scalability**: Ability to separate concerns (Admin, Client, Provider logic).
3.  **Real-time Capabilities**: Needed for runner tracking.
4.  **Developer Experience**: Fast iteration cycle.

## Decision

We chose a **TypeScript Monorepo** (TurboRepo/Nx style via generic workspace) using the following diverse stack to balance performance, developer experience, and scalability:

1.  **Backend: NestJS**
    *   **Why**: Unlike Express (too minimal) or Fastify (too unopinionated), NestJS provides an **Angular-like architecture** with Dependency Injection, Modules, and Decorators. This enforcing structure is crucial for a complex marketplace with multiple domains (Auth, Orders, Products, Runners).
    *   **Diversity**: We use it for its robust ecosystem (Guards, Interceptors, Pipes) which standardizes how we handle validation and security across the entire API.

2.  **Frontend: Next.js (App Router)**
    *   **Why**: We needed a framework that bridges the gap between static sites and dynamic apps. Next.js offers **Server Components** for performance (SEO, initial load) and **Client Components** for interactivity (Maps, Dashboards).
    *   **Diversity**: It allows us to use React not just for UI, but for architectural data fetching pattern, reducing the need for external state management libraries for simple fetches.

3.  **Database: PostgreSQL + Prisma ORM**
    *   **Why**: PostgreSQL is the gold standard for relational data (Orders, Users). Prisma provides the **Type Safety** bridge between our TS backend and the SQL database, preventing an entire class of runtime errors.
    *   **Diversity**: We explicitly chose a relational DB over NoSQL (Mongo) because our data (Orders linking to Users linking to Products) is highly relational and benefits from ACID transactions.

4.  **Real-time: Socket.IO**
    *   **Why**: For the runner tracking features, HTTP polling is inefficient. Socket.IO provides bi-directional fallback-enabled communication.
    *   **Diversity**: This introduces a stateful component to our mostly stateless REST API, requiring specific handling (Gateways, cleanup logic) but enabling the "Uber-like" tracking experience.

5.  **Containerization: Docker / Podman**
    *   **Why**: To eliminate "it works on my machine" issues. We define the exact environment (Node version, DB version, Mailpit) in code.
    *   **Diversity**: We use Mailpit specifically for local email testing to simulate SMTP without sending real emails, ensuring safe isolated development.

## Consequences

- **Pros**:
    *   **Unified Language**: TypeScript everywhere reduces context switching.
    *   **Best-in-Class Tools**: Each tool (Nest, Next, Prisma) is the leader in its specific niche.
    *   **Type Safety**: Changes in the DB schema propagate errors to the Frontend at compile time.

- **Cons**:
    *   **Complexity**: The stack is heavy. Understanding the interplay between Server Components, NestJS Modules, and Docker networking requires a broad skill set.
    *   **Boilerplate**: NestJS requires more initial code (Modules, DTOs) than simpler frameworks.
