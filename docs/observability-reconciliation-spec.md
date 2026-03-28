## Observabilidad Reconciliation Spec

### Objetivo

Extraer de `ObservabilityService` la reconciliación operativa para dejar el façade
centrado en métricas generales y SLA.

### Alcance

La nueva pieza debe concentrar:

- `getReconciliation(window?)`
- construcción de `checks`
- queries de reconciliación por pagos y refunds

### Invariantes

- No cambia el contrato público de `ObservabilityService`.
- Los checks mantienen nombres, severidad y límite de muestras.
- La respuesta sigue sin incluir datos sensibles, solo IDs internos.

### No objetivos

- No mover todavía `getMetrics`.
- No mover todavía `getSlaMetrics`.

### Criterios de aceptación

- `ObservabilityService` delega la reconciliación.
- La spec existente del façade sigue pasando.
- Existe al menos un test focalizado del nuevo servicio.
