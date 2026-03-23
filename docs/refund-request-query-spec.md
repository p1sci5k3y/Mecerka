## Refund Request Query Spec

### Objetivo

Extraer de `RefundsService` la vertical de solicitud y consulta de refund requests,
manteniendo en el façade solo:

- transiciones administrativas
- ejecución Stripe del refund

### Alcance

La nueva implementación debe cubrir:

- `requestRefund`
- `getRefund`
- `listProviderOrderRefunds`
- `listDeliveryOrderRefunds`

Y apoyarse en una pieza compartida para:

- resolución de boundaries
- validaciones de elegibilidad
- capacidad acumulada
- sanitización de lectura

### Invariantes

- No cambia el contrato público de `RefundsService`.
- Los clientes siguen pudiendo solicitar refunds solo sobre boundaries pagados.
- El límite por boundary/actor y la capacidad acumulada se mantienen.
- La emisión de riesgo por abuso de refunds cliente se conserva.

### No objetivos

- No tocar todavía la ejecución Stripe del refund.
- No tocar todavía las transiciones admin `review/approve/reject`.

### Criterios de aceptación

- `RefundsService` delega la solicitud y consulta.
- Los tests existentes del façade siguen pasando.
- Existe al menos un test focalizado del nuevo servicio.
