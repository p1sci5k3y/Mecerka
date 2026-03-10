# Estado del Proyecto (Project Status)

## Progreso General

- **Fase 1 (MVP)**: Finalizada ✅
- **Fase 2 (Autenticación y Frontend Base)**: Finalizada ✅
- **Fase 3 (Gobernanza, Administración y Comunicación)**: Finalizada ✅
- **Fase 4 (Tiempo Real & Seguridad Funcional)**: Finalizada ✅
- **Fase 5 (Dominio Zero-Trust & Bastionado Avanzado)**: Finalizada ✅
- **Fase 6 (Governance & Metrics)**: Finalizada ✅
- **Fase 7 (Deploy, Security & Documentation)**: Finalizada ✅
- **Fase 8 (Stripe Connect & Split Payments)**: Finalizada ✅
- **Fase 9 (AWS EC2 Production Deployment)**: En Progreso 🚧

## Hitos Completados (Milestones & Fases Socráticas)

### Fase 1: MVP Identity & Basics
- **Propósito:** Base de datos relacional y autenticación estructural (JWT).
- **Flujos:** Registro, Login, ABM de Ciudades y Categorías.
- **Invariantes:** Contraseñas hasheadas (Argon2).

### Fase 2: Public Catalog & Privacy
- **Propósito:** Catálogo público purgando PII (Personally Identifiable Information).
- **Flujos:** Explorador de productos por categoría y ciudad para clientes no autenticados.
- **Invariantes:** Solo productos con `isActive: true` son visibles; sin exponer correos de proveedores.

### Fase 3: Order Integrity
- **Propósito:** Integridad en la creación de pedidos consolidados.
- **Flujos:** Conversión de carrito local a Order en BD.
- **Invariantes:** Tolerancia cero al stock negativo, sin cruce de ciudades (`crossing-cities`), consolidación matemática (Map) anti-duplicados.

### Fase 4: State Machines (Real-Time & Role Security)
- **Propósito:** Trazabilidad estricta y delegación de estado de sub-pedidos.
- **Flujos:** ProviderOrder state machine (`PENDING` -> `ACCEPTED` -> `PREPARING` -> `READY_FOR_PICKUP` -> `PICKED_UP`).
- **Invariantes:** Transición atómica optimista; Cancelación parcial frena la distribución logística global (DeliveryStatus estancado).

### Fase 5: Payment, Webhook, & Atomic Idempotency
- **Propósito:** Motor financiero de cero pérdidas y cero overselling.
- **Flujos:** Recepción nativa de Webhook Stripe (`payment_intent.succeeded`) -> Confirmación de Pedido.
- **Invariantes:** Idempotencia garantizada por BD (`WebhookEvent`). Descuento de stock en concurrencia estricta (`updateMany { stock: { gte: cantidad } }`).

### Fase 6: Governance, Metrics, & Admin Consistency
- **Propósito:** Estadísticas puras y jerarquías sin pérdida accidental.
- **Flujos:** Dashboard de ingresos y gestión de usuarios por Admin.
- **Invariantes:** Granting aditivo usando `Set`. Métricas procesan exclusivamente estados económicamente vigentes.

### Fase 7: Despliegue, Seguridad y Documentación Fiel (Actual/Finalizada ✅)
- **Propósito:** Erradicar la deuda técnica antes de la puesta en producción asegurando una cobertura robusta de CI/CD, fortaleciendo la seguridad perimetral contra vulnerabilidades web (OWASP) y documentando fielmente la arquitectura socrática.
- **Flujos:** 
  - **CI/CD Integrado:** El pipeline de *GitHub Actions* asegura la ejecución automática de la suite `npm run test`, bloqueando explícitamente cualquier PR que rompa las pruebas.
  - **Ciclo Completo Integrado (E2E Tests):** Se desarrollaron flujos simulados a través de `orders.e2e-spec.ts` probando desde el registro del cliente hasta la liberación del producto y la asignación al Runner con Stripe _mockeado_.
  - **Revocación Concurrente:** Creación de un endpoint `POST /auth/logout` que incrementa un estado interno en Prisma, forzando un rechazo instantáneo en las estrategias locales.
- **Invariantes:** 
  - **Rate Limiting Estricto:** Objeto `ThrottlerModule` corregido bajo los estándares de NestJS v10+ previniendo denegación de servicio (DoS).
  - **Autenticación Inmutable:** Inyección de `tokenVersion` en BD; todo JWT capturado cuyo número de versión sea inferior al registrado será inmediatamente revocado sin esperas de expiración.
  - **Tipado Seguro:** Interfaz `RequestWithUser` sustituyendo la ambigüedad nativa de `any` en los controladores y refactorización del core de transacciones a `PaymentsService`, para aislar la complejidad financiera.

## Próximos Pasos (Deploy & Producto)

- Puesta en producción (Vercel / Railway).
- Revisión de UX Final para proveedores.
- Pruebas E2E de simulación de flota con múltiples ventanas.

---

## Fase 8: Stripe Connect (Split Payments) 🏗️ *(Finalizada ✅)*
**Propósito:** Transicionar de un modelo "Dummy Merchant" a un Marketplace real Multi-Vendor (Zero-Liability Architecture) sin custodia de credenciales de terceros.

**Flujos Críticos:**
1. **Onboarding Seguro (OAuth):** Flujo en el Dashboard donde Providers y Runners vinculan sus cuentas de cobro ("Connect with Stripe"), devolviendo un `account_id` transparente.
2. **Checkout Unificado (Client):** El cliente paga un único monto (Pedido + Tarifa de Envío) a través de Stripe Payment Element (Soporte Google Pay, Apple Pay).
3. **Split Computado (Direct Charges):** El backend de Mecerka utiliza *PaymentIntents* con el header `Stripe-Account` para crear el Cargo Directamente a la cuenta del Proveedor. Mecerka aísla el coste logístico a través de `application_fee_amount` para luego transferirlo al Runner, logrando un flujo donde la plataforma asume **Cero Responsabilidad** (Zero Liability) legal por *chargebacks* o devoluciones.

**Invariantes:**
- Mecerka JAMÁS almacenará ni solicitará llaves secretas (`sk_live_...`) de proveedores ni repartidores en sus bases de datos.
- Las comisiones o costes (Application Fee) se deducen dinámicamente mediante el orquestador backend con precisión aritmética (`Math.round()` en céntimos) y tipados estrictos.
- KYC Obligatorio: Un proveedor sin la cuenta verificada `stripeAccountId` tiene denegada por API la subida de inventario y no puede recibir órdenes de compra.

---

## Fase 9: AWS EC2 Production Deployment 🚀 *(Finalizada ✅)*
**Propósito:** Desplegar la plataforma monolítica (Frontend SSR + Backend NestJS + PostgreSQL) en una instancia AWS EC2, asegurando certificados SSL, resiliencia con contenedores y pipelines de integración continua.

**Flujos Críticos:**
1. **Bootstrap & Swap:** Instancia `t3.micro` provisionada con Terraform. Se configuró `user_data` para el setup inicial de Docker y Swap de 2GB para soportar builds pesados de Next.js.
2. **Infrastructure-as-Code (IaC):** Gestionada con Terraform (`mecerka-production-sg` e import de instancia).
3. **Dockerización Prod:** `docker-compose.prod.yml` orquestando Postgres, Backend y Frontend, con secretos inyectados dinámicamente.
4. **CI/CD Action:** Workflow `deploy.yml` configurado para inyectar secretos vía SSH y realizar `docker compose up -d` automáticamente en cada push exitoso a `main`.

**Invariantes:**
- Puertos cerrados: 5432 (Postgres) bloqueado al exterior. 22 (SSH) restringido a la IP del administrador.
- Cero Secretos en Código: Todas las claves (`POSTGRES_PASSWORD`, `JWT_SECRET`) se gestionan exclusivamente vía GitHub Secrets y se inyectan en caliente durante el deploy.
- Producción viva en: `http://54.217.186.6` (Nginx en Bienvenida, pendiente de primer deploy exitoso de la app).
