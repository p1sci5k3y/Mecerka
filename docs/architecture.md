# Arquitectura Del Sistema

## Propósito

Mecerka es una plataforma de comercio local organizada por circuitos urbanos de proximidad que conecta `CLIENT`, `PROVIDER`, `RUNNER` y `ADMIN` a través de un frontend localizado en Next.js y un backend NestJS.

La implementación actual no separa demo y producción en aplicaciones distintas. Existe una sola aplicación, una sola API y una sola base de código, desplegadas en entornos aislados con datos, secretos y configuración de ejecución diferentes.

## Mapa de diagramas vigente

La arquitectura actual se apoya ya en un paquete de diagramas coherente con el código y el schema Prisma:

- [Contexto del sistema](./diagrams/system-context.md)
- [Contenedores](./diagrams/container-diagram.md)
- [Entidad-relación completa](./diagrams/er-overview.md)
- [DFD nivel 0](./diagrams/dfd-nivel-0.md)
- [DFD nivel 1](./diagrams/dfd-nivel-1.md)
- [DFD nivel 2 del checkout](./diagrams/dfd-checkout-detalle.md)
- [Secuencia de pedido](./diagrams/order-flow-sequence.md)
- [Modelo de dominio resumido](./diagrams/domain-model-diagram.md)

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
- tracking enriquecido con mapa, timeline, salud operativa y siguiente paso
- superficies de soporte, finanzas y backoffice admin
- tarjetas de “siguiente acción” para runner, provider y admin en hubs operativos

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

## Flujo de petición

El flujo dominante de una petición sigue siendo:

1. el navegador envía la petición
2. el controlador recibe la petición
3. los guards validan autenticación, MFA y roles
4. la validación DTO constriñe la entrada
5. el servicio aplica las reglas de negocio
6. Prisma lee o escribe estado en PostgreSQL
7. se devuelve una respuesta estructurada

Traducido al modelo real del backend:

`browser -> controller -> service -> Prisma -> PostgreSQL`

## Modelo de demo y producción

La arquitectura desplegada usa la misma aplicación para:

- `https://mecerka.me`
- `https://demo.mecerka.me`

Las diferencias correctas entre ambos entornos son:

- database
- secrets
- runtime-config
- demo dataset
- Stripe mode

La lógica de aplicación es la misma.

## Modelo de correo y conectores

El subsistema de correo ya no está gobernado solo por variables de entorno.

La configuración efectiva del transporte resuelve en este orden:

1. configuración persistida desde admin en `SystemSetting`
2. variables de entorno
3. transporte local por defecto (`mailpit:1025`)

En el estado actual, el panel admin soporta:

- `SMTP`
- `AWS SES`

Los secretos persistidos se almacenan cifrados y dependen de `SYSTEM_SETTINGS_MASTER_KEY` en producción. El despliegue dual inyecta esa clave compartida en ambos stacks renderizados.

La edición visible del conector no queda expuesta por defecto: el panel muestra primero el resumen operativo del conector activo y solo abre formularios de `SMTP` o `AWS SES` cuando el operador inicia una nueva conexión o una reconfiguración explícita.

## Puntos Arquitectónicos Relevantes Para Seguridad

La seguridad se hace cumplir mediante:

- `JwtAuthGuard`
- `MfaCompleteGuard`
- `RolesGuard`
- DTO validation
- service-level ownership checks
- transactional role-assignment logic
- structured logging with redaction

La aplicación no depende de comprobaciones exclusivas de frontend para proteger recursos.

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

## Limitaciones reales

- el sistema es modular y orientado a dominio, pero no DDD táctico completo
- la validación fiscal es validación de formato y minimización local, no verificación fiscal externa
- los secretos operativos siguen sin depender de un secret manager externo tipo Vault o AWS Secrets Manager
- `PROVIDER` y `RUNNER` todavía no tienen inbox global propia de soporte
