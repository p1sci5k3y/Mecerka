# Estado del Proyecto (Project Status)

## Progreso General

- **Fase 1 (MVP)**: Finalizada ✅
- **Fase 2 (Autenticación y Frontend Base)**: Finalizada ✅
- **Fase 3 (Gobernanza, Administración y Comunicación)**: Finalizada ✅
- **Fase 4 (Tiempo Real & Seguridad Funcional)**: Finalizada ✅
- **Fase 5 (Dominio Zero-Trust & Bastionado Avanzado)**: Finalizada ✅
- **Fase 6 (Governance & Metrics)**: Finalizada ✅
- **Fase 7 (Deploy, Security & Documentation)**: Finalizada ✅

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

## Fase 8: Stripe Connect (Split Payments) 🏗️ *(Pending)*
**Propósito:** Transicionar de un modelo "Dummy Merchant" a un Marketplace real Multi-Vendor sin custodia de credenciales de terceros.

**Flujos Críticos:**
1. **Onboarding Seguro (OAuth):** Flujo en el Dashboard donde Providers y Runners vinculan sus cuentas de cobro ("Connect with Stripe"), devolviendo un `account_id` transparente.
2. **Checkout Unificado (Client):** El cliente sigue pagando un único monto (Pedido + Tarifa de Envío) a la llave base de Mecerka.
3. **Split Computado:** El backend de Mecerka utiliza `transfer_data` durante el SetupIntent para automáticamente dividir el fondo unificado entre el comercio, el transportista y la reserva de plataforma.

**Invariantes:**
- Mecerka JAMÁS almacenará ni solicitará llaves secretas (`sk_live_...`) de proveedores ni repartidores en sus bases de datos.
- Las comisiones de Plataforma (Application Fee) se deducirán o programarán simétricamente en el momento exacto en que el Runner marca el pedido como "Entregado".
