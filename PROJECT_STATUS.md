# Estado Del Proyecto

Fecha de actualización: `28/03/2026`

## Resumen Ejecutivo

Mecerka está en un estado `implementado y demostrable` para su circuito principal de marketplace multi-proveedor y ya enseña en demo varios circuitos urbanos de comercio local, con despliegue dual `prod + demo`, una superficie frontend muy defendida por tests y un backend que vuelve a combinar amplitud de suites con cobertura global alta.

El proyecto ya no está en fase de construir infraestructura base. El trabajo de mayor retorno ahora consiste en cerrar agujeros de continuidad de negocio y experiencia visible, no en añadir capas técnicas nuevas.

## Estado General

- `Backend`: estable, modularizado, con suites amplias y cobertura global alta.
- `Frontend`: funcional, con cobertura alta y defensa fuerte de flujos críticos.
- `Deploy`: dual environment operativo con `mecerka.me` y `demo.mecerka.me`.
- `Demo`: misma app y misma lógica que producción, con dataset demo y modo de pago fake cuando Stripe está en modo dummy.
- `Demo dataset`: ecosistema multi-ciudad con providers, runners y catálogo alimentario y no alimentario.
- `Documentación`: README, wiki y diagramas reajustados al modelo actual del sistema, incluyendo E/R y DFDs derivados del schema Prisma vigente.

## Métricas Verificadas

### Backend

- Cobertura statements: `95.41%`
- Cobertura branches: `82.40%`
- Cobertura functions: `92.88%`
- Cobertura lines: `95.27%`
- Suites: `124`
- Tests: `1274`

### Frontend

- Cobertura statements: `91.13%`
- Cobertura branches: `84.41%`
- Cobertura functions: `93.27%`
- Cobertura lines: `92.20%`
- Archivos de test: `73`
- Tests: `356`

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
- centro de soporte del cliente
- seguimiento de pedido por UUID real con mapa, timeline, salud operativa y bloque de siguiente paso
- flujo demo de pago fake cuando Stripe está en modo dummy

### Provider

- solicitud de rol
- inventario y CRUD de productos
- panel operativo de ventas
- transición hasta `READY_FOR_PICKUP`
- centro de `Cobros y devoluciones`
- visibilidad de Stripe Connect y refunds ligados a `ProviderOrder`
- soporte contextual ligado a `ProviderOrder` y entrega

### Runner

- solicitud de rol
- panel operativo con pedidos asignables y activos
- aceptación de reparto y ciclo de reparto
- tracking en tiempo real con ruta embebida y siguiente acción operativa
- centro financiero con cobros y estado de Stripe Connect
- soporte contextual ligado a la entrega

### Admin

- rutas protegidas
- dashboard de métricas
- gestión de usuarios y roles
- backoffice de refunds e incidencias
- historial de gobernanza por usuario
- configuración de conectores `SMTP` y `AWS SES` visible, cifrada y editable bajo acción explícita

### Sistema

- pedido raíz + `ProviderOrder` por comercio
- reserva y restauración de stock
- delivery planning por cobertura
- lifecycle de pedido, provider order y runner
- Stripe Connect / split payments
- modo demo con dataset reseteable y credenciales compartidas
- modo demo con dataset multi-ciudad en `Toledo`, `Madrid`, `Valencia`, `Sevilla` y `Bilbao`
- deploy dual con runtime config aislado por host
- configuración `SMTP` y `AWS SES` persistible vía `SystemSetting`, con secretos cifrados en reposo
- clave maestra compartida `SYSTEM_SETTINGS_MASTER_KEY` inyectada en ambos stacks de despliegue

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
- finanzas de provider y runner con lectura honesta de Stripe Connect y siguiente acción priorizada
- pago demo explícito para provider/runner cuando Stripe está en modo dummy
- tracking soportando pedidos UUID reales con timeline, salud operativa, siguiente paso y ETA orientativa
- demo pública ampliada con ciudades, providers, runners y catálogos que permiten enseñar el ciclo completo sin depender de un solo vertical alimentario
- soporte visible para cliente/provider/runner y admin
- panel admin de correo con conectores `SMTP` / `AWS SES`, secretos cifrados y formulario oculto hasta iniciar nueva conexión o reconfiguración

## Limitaciones Reales Que Siguen Abiertas

- no existe todavía una wallet persistente de tarjetas del cliente
- la gestión de refunds sigue siendo más sólida en backend que en frontend
- `provider` y `runner` siguen sin inbox global propia de soporte
- faltan más flujos e2e públicos sobre demo para defensa integral por perfil

## Riesgos Actuales

- deuda de continuidad UX entre pantallas operativas y financieras
- riesgo de percepción de producto “a medias” si no se sigue cerrando caso de uso por caso de uso

## Siguiente Prioridad Recomendada

### Prioridad 1

1. crear inbox global de soporte para `PROVIDER` y `RUNNER`
2. ampliar e2e públicos y demo multi-rol
3. seguir cerrando la UX visible de cancelación / refund

### Prioridad 2

1. tabla funcional formal de estados para defensa
2. cerrar wallet/métodos de pago persistentes del cliente
3. mantener documentación, wiki y diagramas recalculados tras bloques fuertes

## Conclusión

El proyecto ya no está en “MVP incompleto” ni en “infraestructura en construcción”. Está en una fase de cierre de circuito real de negocio. La base técnica es sólida; lo que queda por hacer es transformar piezas ya implementadas en experiencia completa, visible y defendible de extremo a extremo.
