# Estado Del Proyecto

Fecha de actualización: `27/03/2026`

## Resumen Ejecutivo

Mecerka está en un estado `implementado y demostrable` para su circuito principal de marketplace multi-proveedor en una ciudad, con despliegue dual `prod + demo`, una superficie frontend muy defendida por tests y un backend que vuelve a combinar amplitud de suites con cobertura global alta.

El proyecto ya no está en fase de construir infraestructura base. El trabajo de mayor retorno ahora consiste en cerrar agujeros de continuidad de negocio y experiencia visible, no en añadir capas técnicas nuevas.

## Estado General

- `Backend`: estable, modularizado, con suites amplias y cobertura global alta.
- `Frontend`: funcional, con cobertura alta y defensa fuerte de flujos críticos.
- `Deploy`: dual environment operativo con `mecerka.me` y `demo.mecerka.me`.
- `Demo`: misma app y misma lógica que producción, con dataset demo y modo de pago fake cuando Stripe está en modo dummy.
- `Documentación`: README y wiki actualizados; este documento queda alineado con ese estado.

## Métricas Verificadas

### Backend

- Cobertura statements: `95.99%`
- Cobertura branches: `84.70%`
- Cobertura functions: `93.55%`
- Cobertura lines: `95.84%`
- Suites: `122`
- Tests: `1221`

### Frontend

- Cobertura statements: `90.66%`
- Cobertura branches: `81.85%`
- Cobertura functions: `91.94%`
- Cobertura lines: `92.17%`
- Archivos de test: `59`
- Tests: `228`

## Capacidades Cerradas

### Cliente

- registro, login y sesión por roles
- catálogo público por ciudad y categoría
- detalle de producto
- carrito con restricción por ciudad
- checkout multi-proveedor
- pagos separados por provider y runner
- centro de `Mis pedidos`
- centro de `Pagos y tarjetas`
- seguimiento de pedido por UUID real
- flujo demo de pago fake cuando Stripe está en modo dummy

### Provider

- solicitud de rol
- inventario y CRUD de productos
- panel operativo de ventas
- transición hasta `READY_FOR_PICKUP`
- centro de `Cobros y devoluciones`
- visibilidad de Stripe Connect y refunds ligados a `ProviderOrder`

### Runner

- solicitud de rol
- panel operativo con pedidos asignables y activos
- aceptación de reparto y ciclo de reparto
- tracking en tiempo real
- centro financiero con cobros y estado de Stripe Connect

### Admin

- rutas protegidas
- dashboard de métricas
- gestión de usuarios y roles
- visibilidad de refund requests y gobierno operativo base

### Sistema

- pedido raíz + `ProviderOrder` por comercio
- reserva y restauración de stock
- delivery planning por cobertura
- lifecycle de pedido, provider order y runner
- Stripe Connect / split payments
- modo demo con dataset reseteable y credenciales compartidas
- deploy dual con runtime config aislado por host

## Casos De Uso Priorizados

Referencia de auditoría:
- [/Users/machinehead/Documents/TFM/docs/use-case-audit-priority.md](/Users/machinehead/Documents/TFM/docs/use-case-audit-priority.md)

### Implementados Y Demostrables

- `UC-001` checkout multi-proveedor en una ciudad
- `UC-002` reserva y liberación de stock
- `UC-003` máquina de estados del pedido
- `UC-005` flujo provider hasta `READY_FOR_PICKUP`

### Parcialmente Implementados

- `UC-004` cancelación y reembolso

Lectura honesta:
- backend y reglas de negocio de `UC-004` están bastante cerrados
- la parte más floja sigue siendo la experiencia visible y completa de refunds/cancelaciones en frontend y backoffice

## Superficie Visible Cerrada Recientemente

- `Mis pedidos` con separación entre pendientes e histórico
- navegación desde pagos a pedido y tracking
- `Pagos y tarjetas` para cliente, dejando explícito que todavía no hay wallet persistente
- finanzas de provider y runner con lectura honesta de Stripe Connect
- pago demo explícito para provider/runner cuando Stripe está en modo dummy
- tracking soportando pedidos UUID reales

## Limitaciones Reales Que Siguen Abiertas

- no existe todavía una wallet persistente de tarjetas del cliente
- la gestión de refunds sigue siendo más sólida en backend que en frontend
- admin/backoffice aún necesita más recorrido visible para resolución completa de incidencias
- faltan más flujos e2e públicos sobre demo para defensa integral por perfil

## Riesgos Actuales

- deuda de continuidad UX entre pantallas operativas y financieras
- riesgo de percepción de producto “a medias” si no se sigue cerrando caso de uso por caso de uso

## Siguiente Prioridad Recomendada

### Prioridad 1

1. cerrar frontend/backoffice de cancelación y refund visible
2. reforzar continuidad entre paneles operativos y financieros de provider/runner
3. ampliar e2e públicos y demo multi-rol

### Prioridad 2

1. tabla funcional formal de estados para defensa
2. rematar hotspots frontend restantes (`navbar`, `runner`, `provider/finance`, `runtime-config`)
3. consolidar backoffice visible de incidencias y refunds

## Conclusión

El proyecto ya no está en “MVP incompleto” ni en “infraestructura en construcción”. Está en una fase de cierre de circuito real de negocio. La base técnica es sólida; lo que queda por hacer es transformar piezas ya implementadas en experiencia completa, visible y defendible de extremo a extremo.
