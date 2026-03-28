# Auditoría De Casos De Uso Prioritarios

Estado auditado sobre `main` a `28/03/2026`, con foco en los flujos que hoy mejor describen el producto real.

## Escala

- `Implementado y demostrable`
- `Parcialmente implementado`
- `Pensado pero no cerrado`

## UC-001 Checkout Multi-proveedor En Una Ciudad

- Estado: `Implementado y demostrable`
- Demostrable hoy:
  - carrito agrupado por proveedor
  - checkout con dirección y cobertura
  - pedido raíz + `ProviderOrder[]`
  - pago separado por provider y runner
  - demo pública con flujo `orders -> payments -> track`

## UC-002 Reserva Y Liberación De Stock

- Estado: `Implementado y demostrable`
- Demostrable hoy:
  - reserva previa al pago
  - consumo idempotente
  - restauración de inventario en cancelaciones válidas

## UC-003 Máquina De Estados Del Pedido

- Estado: `Implementado y demostrable`
- Demostrable hoy:
  - transiciones por rol
  - sincronización `ProviderOrder -> Order`
  - runner `accept -> in transit -> complete`

## UC-004 Cancelación Y Reembolso

- Estado: `Parcialmente implementado`, pero sensiblemente más maduro que en auditorías anteriores
- Demostrable hoy:
  - infraestructura backend sólida de refunds
  - soporte visible para cliente
  - backoffice admin para refunds
- Hueco real:
  - UX final de cancelación / refund todavía más sólida en backend que en frontend
  - falta cerrar mejor la política visible de parcial vs total

## UC-005 Flujo Provider Hasta `READY_FOR_PICKUP`

- Estado: `Implementado y demostrable`
- Demostrable hoy:
  - aceptar
  - preparar
  - dejar listo para recogida
  - detalle de venta y soporte contextual

## UC-006 Soporte Operativo Multi-rol

- Estado: `Parcialmente implementado`
- Demostrable hoy:
  - `CLIENT` tiene bandeja propia de soporte
  - `PROVIDER` y `RUNNER` tienen hubs de soporte contextuales
  - `ADMIN` tiene cola, detalle de caso y enlaces cruzados
- Hueco real:
  - falta inbox global por rol para `PROVIDER` y `RUNNER`

## Priorización Recomendada

### Prioridad 1

1. Formalizar `UC-003` con tabla funcional de estados.
2. Cerrar `UC-004` y `UC-006` como experiencia visible completa por rol.
3. Consolidar la experiencia operativa visible de soporte, cancelación y refund.

### Prioridad 2

1. Wallet/métodos de pago persistentes del cliente.
2. Bandeja global de soporte para `PROVIDER` y `RUNNER`.
3. Más e2e públicos multi-rol sobre la demo.
