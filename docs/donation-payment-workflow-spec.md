## Donation Payment Workflow Spec

### Objetivo

Extraer de `SupportService` el flujo de pago de donaciones para dejar el façade de
support centrado en:

- creación de donaciones
- lectura de donaciones

### Alcance

La nueva pieza debe concentrar:

- `prepareDonationPayment`
- `confirmDonationPayment`
- `failDonationPayment`
- lifecycle de `donationWebhookEvent`
- interacción con Stripe `paymentIntents`

### Invariantes

- No cambia el contrato público de `SupportService`.
- Las donaciones siguen aisladas del dominio marketplace.
- La idempotencia de webhook sigue siendo específica de donaciones.
- La reutilización de sesiones READY sigue igual.

### No objetivos

- No cambiar la política de configuración de donaciones.
- No cambiar la creación o lectura base de la donación.

### Criterios de aceptación

- `SupportService` delega el workflow de pago.
- Los tests existentes de support siguen pasando.
- Existe al menos un test focalizado del nuevo servicio.
