# Cancelación Y Reembolso Spec

## Objetivo

Formalizar el caso de uso `UC-004` para que cancelación y refund dejen de ser un conjunto de piezas técnicas y pasen a ser un comportamiento de negocio defendible, verificable y estable.

## Alcance

Este caso de uso cubre:

- cancelación total de un pedido por cliente o admin según estado
- cancelación de pedidos parcialmente rechazados por proveedor
- restauración de inventario solo sobre subpedidos todavía activos
- solicitud de refund sobre `ProviderOrder` o `DeliveryOrder`
- lectura y listado de refund requests con control de acceso por actor
- transición administrativa `REQUESTED -> UNDER_REVIEW -> APPROVED|REJECTED`
- ejecución de refund aprobados sobre el boundary correcto

## Actores

- `CLIENT`
- `PROVIDER`
- `ADMIN`
- sistema de pagos/refunds

## Reglas de negocio

- Un cliente solo puede cancelar un pedido en `PENDING`.
- Un cliente puede cancelar un pedido en `CONFIRMED` solo si ya existe al menos un subpedido `REJECTED_BY_STORE` o `CANCELLED`.
- Un admin puede cancelar cualquier pedido no terminal.
- La restauración de inventario solo afecta a subpedidos no rechazados y no cancelados.
- Cada refund request debe apuntar exactamente a un boundary pagado:
  - `ProviderOrder`
  - `DeliveryOrder`
- Un refund parcial debe ser menor que el importe capturado.
- Un refund total debe coincidir exactamente con el importe capturado.
- Cliente y provider solo pueden leer los refunds que les pertenecen; admin puede leer todos.

## Escenarios principales

### Escenario A: cancelación total antes de preparación

```gherkin
Scenario: Cliente cancela un pedido pendiente
  Given existe un pedido del cliente en estado PENDING
  When el cliente solicita la cancelación
  Then el pedido pasa a CANCELLED
  And los subpedidos activos pasan a CANCELLED
  And no se restaura inventario si todavía no había consumo confirmado
```

### Escenario B: cancelación de pedido parcialmente rechazado

```gherkin
Scenario: Cliente cancela un pedido confirmado con subpedidos rechazados
  Given existe un pedido en estado CONFIRMED
  And al menos un ProviderOrder está REJECTED_BY_STORE o CANCELLED
  And otro ProviderOrder sigue activo
  When el cliente solicita la cancelación
  Then el pedido raíz pasa a CANCELLED
  And solo se restauran los items de los subpedidos activos
  And no se restauran items de subpedidos ya rechazados o cancelados
```

### Escenario C: refund parcial de proveedor

```gherkin
Scenario: Cliente solicita un refund parcial sobre un subpedido pagado
  Given existe un ProviderOrder pagado del cliente
  When el cliente solicita un refund parcial válido
  Then se crea un RefundRequest en estado REQUESTED
  And el importe queda sanitizado en el read model
  And el cliente puede leer y listar ese refund
```

### Escenario D: lectura segura de refunds

```gherkin
Scenario: Usuario no relacionado intenta leer un refund
  Given existe un RefundRequest asociado a otro cliente y otro proveedor
  When un usuario no relacionado intenta leerlo
  Then el sistema responde como not found
```

## Criterios de aceptación

- existe test para cancelación de `CONFIRMED` con subpedidos mixtos que verifica restauración selectiva de inventario
- existe test para request de refund que demuestra que un fallo en la integración de riesgo no rompe la solicitud
- existe test para lectura segura de refunds por actor relacionado y por actor no relacionado
- existe test para listado de refunds de delivery con acceso del cliente propietario y denegación a terceros
- backend `lint`, `type-check` y tests focalizados pasan

## Artefactos relevantes

- `/Users/machinehead/Documents/TFM/backend/src/orders/order-status.service.ts`
- `/Users/machinehead/Documents/TFM/backend/src/orders/order-status.service.spec.ts`
- `/Users/machinehead/Documents/TFM/backend/src/refunds/refund-request-query.service.ts`
- `/Users/machinehead/Documents/TFM/backend/src/refunds/refund-request-query.service.spec.ts`
- `/Users/machinehead/Documents/TFM/backend/src/refunds/refunds.service.ts`
- `/Users/machinehead/Documents/TFM/backend/src/refunds/refunds.service.spec.ts`
