## Provider Payment Confirmation Spec

### Objetivo

Extraer de `StripeWebhookService` la confirmación transaccional de un pago de
`ProviderOrder` ya verificado, manteniendo al webhook como coordinador de:

- reclamación idempotente del webhook
- marcado final del `paymentWebhookEvent`
- emisión de eventos de dominio

### Alcance

La nueva pieza debe concentrar solo:

- resolución de cuenta Stripe activa del proveedor
- validación del payload confirmado
- bloqueo transaccional
- consumo de reservas y decremento de stock
- actualización de `ProviderPaymentSession`, `ProviderOrder` y `Order`

### Invariantes

- No cambia el contrato público de `StripeWebhookService.confirmProviderOrderPayment`.
- El payload confirmado debe seguir validándose contra:
  - importe
  - moneda
  - connected account
  - metadata
- La operación sigue siendo segura ante concurrencia con `FOR UPDATE`.
- Los eventos de dominio siguen saliendo desde `StripeWebhookService`.

### No objetivos

- No cambiar la semántica del webhook event audit.
- No cambiar el wrapper legacy `confirmPayment`.
- No introducir nuevos estados ni tablas.

### Criterios de aceptación

- `StripeWebhookService` delega la confirmación transaccional completa.
- La lógica observable de pago confirmado sigue intacta.
- Hay test focalizado del nuevo servicio además de los tests existentes del webhook.
