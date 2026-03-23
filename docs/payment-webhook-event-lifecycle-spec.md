## Payment Webhook Event Lifecycle Spec

### Objetivo

Extraer de `StripeWebhookService` la responsabilidad de reclamar, consultar y marcar
el estado de `paymentWebhookEvent` sin cambiar el comportamiento observable del flujo
de confirmación de pagos por proveedor.

### Alcance

La nueva pieza debe concentrar solo:

- `isProcessed(eventId)`
- `claim(eventId, provider, eventType)`
- `markStatus(eventId, status, processedAt?)`

### Invariantes

- Un evento con estado `PROCESSED` o `IGNORED` se considera terminal.
- Un conflicto `P2002` solo puede recuperarse si el evento previo está en:
  - `FAILED`
  - `RECEIVED` y además está stale según la ventana existente de cinco minutos.
- La reclamación debe seguir siendo idempotente.
- No cambia el contrato público de `StripeWebhookService`.

### No objetivos

- No mover todavía la validación del pago confirmado.
- No mover todavía la transacción de consumo de reservas/stock.
- No cambiar nombres de estados, tabla ni modelo Prisma.

### Criterios de aceptación

- `StripeWebhookService` delega completamente el lifecycle de `paymentWebhookEvent`.
- Los tests actuales de webhook siguen pasando.
- Existe un test focalizado del nuevo servicio.
