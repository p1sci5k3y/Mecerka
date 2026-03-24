# Auditoría De Casos De Uso Prioritarios

Estado auditado sobre el código actual de `main`, con foco en cinco flujos de negocio que conviene defender y endurecer antes de seguir ampliando funcionalidades.

## Escala

- `Implementado y demostrable`: existe lógica principal y ya hay cobertura significativa.
- `Parcialmente implementado`: existe infraestructura y parte del flujo, pero faltan variantes, UX o criterios de aceptación completos.
- `Pensado pero no cerrado`: hay piezas sueltas, pero no un circuito funcional sólido de extremo a extremo.

## UC-001 Checkout Multi-proveedor En Una Ciudad

- Estado: `Implementado y demostrable`
- Objetivo: validar carrito, calcular entrega agregada, crear pedido raíz y subpedidos por proveedor.
- Backend principal:
  - `/Users/machinehead/Documents/TFM/backend/src/orders/checkout-cart-validation.service.ts`
  - `/Users/machinehead/Documents/TFM/backend/src/orders/checkout-delivery-planning.service.ts`
  - `/Users/machinehead/Documents/TFM/backend/src/orders/checkout-order-creation.service.ts`
  - `/Users/machinehead/Documents/TFM/backend/src/orders/checkout.service.ts`
  - `/Users/machinehead/Documents/TFM/backend/src/orders/orders.service.checkout.spec.ts`
  - `/Users/machinehead/Documents/TFM/backend/src/orders/orders.domain.spec.ts`
- Frontend principal:
  - `/Users/machinehead/Documents/TFM/frontend/app/[locale]/cart/page.tsx`
  - `/Users/machinehead/Documents/TFM/frontend/app/[locale]/orders/[id]/payments/page.tsx`
  - `/Users/machinehead/Documents/TFM/frontend/__tests__/cart-page.test.tsx`
  - `/Users/machinehead/Documents/TFM/frontend/__tests__/order-payments-experience.test.tsx`
- Demostrable hoy:
  - restricción por ciudad
  - agrupación por proveedor
  - pedido raíz + subpedidos
  - coste de reparto separado
  - pagos por comercio y runner separados
- Hueco real:
  - falta cerrar mejor la experiencia demo/prod en datos reales del catálogo y detalle si el entorno apunta a la API incorrecta

## UC-002 Reserva Y Liberación De Stock

- Estado: `Implementado y demostrable`
- Objetivo: reservar stock al checkout, consumirlo exactamente una vez tras confirmación y restaurarlo en cancelaciones válidas.
- Backend principal:
  - `/Users/machinehead/Documents/TFM/backend/src/orders/stock-reservation.service.ts`
  - `/Users/machinehead/Documents/TFM/backend/src/orders/checkout-order-creation.service.ts`
  - `/Users/machinehead/Documents/TFM/backend/src/orders/repositories/prisma-order.repository.ts`
  - `/Users/machinehead/Documents/TFM/backend/src/payments/provider-payment-settlement.service.ts`
  - `/Users/machinehead/Documents/TFM/backend/src/payments/stripe-webhook.service.ts`
- Tests relevantes:
  - `/Users/machinehead/Documents/TFM/backend/src/orders/orders.service.checkout.spec.ts`
  - `/Users/machinehead/Documents/TFM/backend/src/orders/orders.domain.spec.ts`
  - `/Users/machinehead/Documents/TFM/backend/src/payments/provider-payment-settlement.service.spec.ts`
  - `/Users/machinehead/Documents/TFM/backend/src/payments/stripe-webhook.service.spec.ts`
  - `/Users/machinehead/Documents/TFM/backend/src/orders/repositories/prisma-order.repository.spec.ts`
- Demostrable hoy:
  - reserva previa a la sesión de pago
  - consumo idempotente
  - replay seguro de webhooks
  - restauración de inventario en cancelaciones admitidas
- Hueco real:
  - conviene documentar formalmente expiración y liberación automática de reservas como criterio de aceptación de negocio, no solo como detalle técnico

## UC-003 Máquina De Estados Del Pedido

- Estado: `Implementado y demostrable`
- Objetivo: gobernar transiciones de `Order`, `ProviderOrder` y ciclo runner con reglas por rol.
- Backend principal:
  - `/Users/machinehead/Documents/TFM/backend/src/orders/order-status.service.ts`
  - `/Users/machinehead/Documents/TFM/backend/src/orders/order-runner-lifecycle.service.ts`
  - `/Users/machinehead/Documents/TFM/backend/src/orders/utils/state-machine.ts`
  - `/Users/machinehead/Documents/TFM/backend/src/delivery/delivery-lifecycle.service.ts`
- Tests relevantes:
  - `/Users/machinehead/Documents/TFM/backend/src/orders/order-status.service.spec.ts`
  - `/Users/machinehead/Documents/TFM/backend/src/orders/order-runner-lifecycle.service.spec.ts`
  - `/Users/machinehead/Documents/TFM/backend/src/orders/utils/state-machine.spec.ts`
  - `/Users/machinehead/Documents/TFM/backend/src/delivery/delivery-lifecycle.service.spec.ts`
- Demostrable hoy:
  - transiciones por rol
  - sincronización de estados proveedor → pedido raíz
  - runner `READY_FOR_PICKUP -> PICKED_UP` y ciclo de reparto
- Hueco real:
  - falta una especificación funcional visible, tipo tabla o Gherkin, para defensa oral y para alinear frontend/backoffice con los estados admitidos

## UC-004 Cancelación Y Reembolso

- Estado: `Parcialmente implementado`
- Objetivo: cancelar pedidos o subpedidos bajo reglas de negocio y disparar devolución coherente.
- Backend principal:
  - `/Users/machinehead/Documents/TFM/backend/src/orders/order-status.service.ts`
  - `/Users/machinehead/Documents/TFM/backend/src/refunds/refunds.service.ts`
  - `/Users/machinehead/Documents/TFM/backend/src/refunds/refund-boundary-resolution.service.ts`
  - `/Users/machinehead/Documents/TFM/backend/src/refunds/refund-request-query.service.ts`
  - `/Users/machinehead/Documents/TFM/docs/cancel-refund-use-case-spec.md`
- Tests relevantes:
  - `/Users/machinehead/Documents/TFM/backend/src/orders/order-status.service.spec.ts`
  - `/Users/machinehead/Documents/TFM/backend/src/refunds/refunds.service.spec.ts`
  - `/Users/machinehead/Documents/TFM/backend/src/refunds/refund-boundary-resolution.service.spec.ts`
  - `/Users/machinehead/Documents/TFM/backend/src/refunds/refunds.controller.spec.ts`
- Demostrable hoy:
  - cancelación permitida según estado/rol
  - restauración de inventario al cancelar
  - infraestructura de refunds y resolución de límites
- Hueco real:
  - falta cerrar como caso de uso visible:
    - cancelación total vs parcial
    - reembolso por producto faltante
    - reembolso por entrega fallida
    - qué ve exactamente el cliente en frontend y qué dispara el admin
  - ya existe especificación funcional inicial, pero todavía falta cerrar la parte visible de frontend y la política exacta de refund parcial vs total por incidente

## UC-005 Flujo Proveedor Hasta `READY_FOR_PICKUP`

- Estado: `Implementado y demostrable`
- Objetivo: que el provider acepte, prepare y deje listo un pedido para recogida.
- Backend principal:
  - `/Users/machinehead/Documents/TFM/backend/src/orders/order-status.service.ts`
  - `/Users/machinehead/Documents/TFM/backend/src/orders/order-query.service.ts`
- Frontend principal:
  - `/Users/machinehead/Documents/TFM/frontend/app/[locale]/provider/sales/page.tsx`
  - `/Users/machinehead/Documents/TFM/frontend/components/provider/ProviderOrderCard.tsx`
- Tests relevantes:
  - `/Users/machinehead/Documents/TFM/backend/src/orders/order-status.service.spec.ts`
  - `/Users/machinehead/Documents/TFM/frontend/__tests__/provider-order-card.test.tsx`
  - `/Users/machinehead/Documents/TFM/frontend/__tests__/provider-sales-experience.test.tsx`
- Demostrable hoy:
  - aceptar
  - rechazar
  - pasar a `PREPARING`
  - pasar a `READY_FOR_PICKUP`
- Hueco real:
  - falta completar mejor la experiencia maker alrededor del inventario y edición con criterios operativos claros para producto inactivo, stock agotado y catálogo diario

## Priorización Recomendada

### Prioridad 1

1. Formalizar `UC-003` con tabla de estados y transiciones permitidas.
2. Cerrar `UC-004` como especificación de negocio visible en frontend + backend.
3. Corregir demo/prod para que `UC-001` sea demostrable también en entorno desplegado.

### Prioridad 2

1. Añadir specs Gherkin de cancelación total y reembolso parcial.
2. Añadir specs de proveedor para faltante de stock o rechazo parcial.
3. Añadir specs e2e de seguimiento pedido → pagos → entrega.

## Siguiente Sprint Spec-driven Recomendado

### Sprint A

- `UC-003` Tabla formal de estados.
- `UC-004` Cancelación total antes de preparación.
- `UC-004` Reembolso parcial por subpedido rechazado.

### Sprint B

- `UC-001` Entorno demo coherente con catálogo/detalle reales.
- `UC-005` Producto agotado y stock operativo del provider.
- `UC-002` Caducidad y liberación visible de reservas.
