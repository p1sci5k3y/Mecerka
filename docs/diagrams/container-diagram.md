# Diagrama De Contenedores

```mermaid
flowchart TB
    subgraph "Capa cliente"
      browser["Web browser"]
    end

    subgraph "Contenedor frontend"
      next["Next.js App"]
      playwright["Playwright / Browser E2E"]
    end

    subgraph "Contenedor backend"
      api["Controladores NestJS / WebSockets"]
      services["Application services"]
      prisma["Prisma Client"]
      support["Support / Refund / Demo / Risk"]
      emailcfg["EmailSettingsService"]
    end

    subgraph "Base de datos"
      postgres["PostgreSQL"]
    end

    subgraph "Servicios externos"
      stripe["Stripe / Connect"]
      smtp["SMTP / SES / Mailpit"]
      geo["Geocoding"]
    end

    browser --> next
    playwright --> next
    next --> api
    api --> services
    services --> prisma
    support --> prisma
    emailcfg --> prisma
    prisma --> postgres
    services --> stripe
    stripe --> api
    services --> smtp
    services --> geo
```
