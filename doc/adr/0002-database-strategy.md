# 2. Database & ORM Strategy

Date: 2026-01-20

## Status

Accepted

## Context

The application manages relational data: Users, Products, Orders, Cities, Categories.
- **Relationships**: Complex relations (One-to-Many for User->Orders, User->Products; Self-referencing or Role-based filtering).
- **Integrity**: Transactional integrity is critical for Orders (stock deduction + order creation).

## Decision

We chose **PostgreSQL** with **Prisma ORM**.

1.  **PostgreSQL**:
    - **Why**: robust, ACID-compliant, excellent support for geospatial data (PostGIS could be added later for advanced tracking, though simpler lat/lng floats are used initially).

2.  **Prisma ORM**:
    - **Why**: 
        - Auto-generated TypeScript client based on schema.
        - Declarative schema definition (`schema.prisma`).
        - Migrations management included.
        - Intuitive API for relations (`include`, `select`).

## Consequences

- **Pros**: Type-safe database queries. Easy schema evolution.
- **Cons**: Prisma runtime overhead (though minimal for this scale). Complex aggregation queries can sometimes be verbose compared to raw SQL.
