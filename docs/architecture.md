# Arquitectura Del Sistema

## Propósito

Mecerka es una plataforma de comercio local acotada a una ciudad que conecta `CLIENT`, `PROVIDER`, `RUNNER` y `ADMIN` a través de un frontend localizado en Next.js y un backend NestJS.

La implementación actual no separa demo y producción en aplicaciones distintas. Existe una sola aplicación, una sola API y una sola base de código, desplegadas en entornos aislados con datos, secretos y configuración de ejecución diferentes.

## Stack real de implementación

- frontend con Next.js App Router
- backend NestJS como monolito modular
- Prisma ORM / Prisma Client
- PostgreSQL como base de datos operativa
- Docker Compose para ejecución local y despliegue estilo producción
- Stripe / Stripe Connect para orquestación de pagos
- Nodemailer para transporte de correo
- Mailpit en local y SMTP externo en entornos desplegados

## Estilo arquitectónico

El backend es un monolito modular organizado por capacidades de negocio.

La descripción correcta es "inspirado en DDD", no DDD táctico completo. Lo verificable en código es:

- controladores finos para transporte HTTP y WebSocket
- validación por DTOs y cadenas de guards
- servicios como punto principal de invariantes y orquestación
- Prisma como capa única de persistencia

## Arquitectura de ejecución verificada

La aplicación depende de PostgreSQL a través de `DATABASE_URL`. Si la base de datos no está disponible, el backend no puede completar su arranque normal.

Esto se observa en:

- la configuración del datasource de Prisma
- `PrismaService`
- el comportamiento de arranque y migraciones en los despliegues

## Modelo de ejecución en contenedores

El repositorio incluye:

- orquestación local con Docker Compose
- orquestación de despliegue dual
- Dockerfiles separados para backend y frontend

La pila local incluye:

- `postgres`
- `backend`
- `frontend`
- `mailpit`

El modelo desplegado usa:

- una imagen de backend
- una imagen de frontend
- stacks aislados `prod` y `demo`
- Nginx como proxy inverso con TLS

## Estructura por capas

### Frontend

El frontend se responsabiliza de:

- rutas localizadas bajo `app/[locale]`
- navegación sensible al rol y rutas protegidas
- exploración de catálogo
- UX de carrito, checkout, pedidos, pagos y seguimiento
- superficies de soporte, finanzas y backoffice admin

### Controladores

Los controladores NestJS gestionan:

- routing
- binding de DTOs
- validación
- aplicación de guards
- preocupaciones de transporte

Las reglas de negocio no se concentran deliberadamente en los controladores.

### Servicios

Las invariantes principales viven en servicios como:

- `AuthService`
- `UsersService`
- `RoleAssignmentService`
- `OrdersService`
- `PaymentsService`
- `DeliveryService`
- `RefundsService`
- `AdminService`
- `EmailSettingsService`

Aquí es donde el proyecto hace cumplir:

- validaciones de propiedad del recurso
- límites transaccionales
- invariantes de asignación de roles
- transiciones de estado de pedido, reparto y pago
- fronteras entre devoluciones e incidencias
- configuración SMTP gobernada por admin

### Persistencia

Prisma se usa como capa de persistencia y consulta, no como motor de reglas de negocio.

Conceptos persistentes importantes del modelo actual:

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
