# Campaña de Calidad de Specs Frontend

Estado actualizado a `28/03/2026` sobre `main`, con snapshot real sacada de [`/Users/machinehead/Documents/TFM/frontend/coverage/coverage-summary.json`](/Users/machinehead/Documents/TFM/frontend/coverage/coverage-summary.json).

## Objetivo

No usar el `coverage` como métrica decorativa. La campaña busca que las specs de `frontend` se acerquen al estándar de las mejores pruebas del repositorio:

- verificar flujo visible y no solo render básico;
- cubrir ramas de negocio, validaciones y navegación;
- comprobar `degradación segura` cuando fallan servicios secundarios o cargas principales;
- detectar regresiones reales de producto, no solo tocar líneas.

## Snapshot actual

- `73` files de test ejecutados
- `356` tests
- `91.13%` statements
- `84.41%` branches
- `93.20%` functions
- `92.20%` lines

Referencia de salida:

- [`/Users/machinehead/Documents/TFM/frontend/coverage/coverage-summary.json`](/Users/machinehead/Documents/TFM/frontend/coverage/coverage-summary.json)

## Criterio de Spec de Alta Calidad

Una spec se considera de alta calidad cuando cumple la mayoría de estos puntos:

- cubre `happy path` y al menos una rama de error o degradación;
- comprueba interacciones visibles y estados finales, no solo llamadas a mocks;
- evita aserciones frágiles de timing sin `waitFor` o `findBy*` cuando hay transiciones de estado;
- valida condiciones de `disabled`, filtros, navegación o enlaces derivados del rol;
- si descubre un bug de producto, se corrige el producto y no solo la prueba.

## Bloques reforzados

### Bloque 1

- [`/Users/machinehead/Documents/TFM/frontend/__tests__/order-payments-experience.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/order-payments-experience.test.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/__tests__/admin-demo-users-services.test.ts`](/Users/machinehead/Documents/TFM/frontend/__tests__/admin-demo-users-services.test.ts)
- [`/Users/machinehead/Documents/TFM/frontend/__tests__/profile-support-page.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/profile-support-page.test.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/__tests__/provider-order-detail-page.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/provider-order-detail-page.test.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/__tests__/runner-order-detail-page.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/runner-order-detail-page.test.tsx)

Resultado:

- estabilización de una spec flaky de pagos;
- `admin-service` endurecido hasta cubrir rutas individuales, historial de gobernanza, SMTP admin y errores `not found`;
- mejor cobertura de `support` y hubs operativos de `provider` y `runner`.

### Bloque 2

- [`/Users/machinehead/Documents/TFM/frontend/__tests__/navbar-role-locale.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/navbar-role-locale.test.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/__tests__/provider-support-page.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/provider-support-page.test.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/__tests__/runner-support-page.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/runner-support-page.test.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/__tests__/track-order-page.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/track-order-page.test.tsx)

Resultado:

- cobertura explícita de `mobile drawer`, locale switching y rutas por rol en `navbar`;
- validación de `disabled` y `degradación segura` en hubs de soporte `provider/runner`;
- `track` endurecido para pedidos sin `deliveryOrder`, sin tramos reembolsables y fallo de carga principal.

### Bloque 3

- [`/Users/machinehead/Documents/TFM/frontend/__tests__/admin-refunds-page.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/admin-refunds-page.test.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/__tests__/admin-refund-detail-page.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/admin-refund-detail-page.test.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/__tests__/admin-incident-detail-page.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/admin-incident-detail-page.test.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/__tests__/admin-dashboard-experience.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/admin-dashboard-experience.test.tsx)

Resultado:

- detalle de casos admin con ramas de `review`, `approve`, `execute`, `resolve` y fallback de carga;
- comprobación de enlaces contextuales a pedido, provider y runner;
- refuerzo del dashboard admin y de colas read-only.

### Bloque 4

- [`/Users/machinehead/Documents/TFM/frontend/__tests__/profile-experience.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/profile-experience.test.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/__tests__/order-detail-page.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/order-detail-page.test.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/__tests__/provider-finance-page.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/provider-finance-page.test.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/__tests__/runner-finance-page.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/runner-finance-page.test.tsx)

Resultado:

- `profile` endurecido con fallo de configuración del PIN y caso de último rol solicitable;
- `order detail` reforzado con continuidad sin pagos pendientes y seguimiento no activo;
- `provider/runner finance` ya degradan con error visible si la carga principal falla.

### Bloque 5

- [`/Users/machinehead/Documents/TFM/frontend/__tests__/admin-users-page.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/admin-users-page.test.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/__tests__/admin-user-detail-page.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/admin-user-detail-page.test.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/__tests__/admin-role-requests-page.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/admin-role-requests-page.test.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/__tests__/navbar-role-locale.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/navbar-role-locale.test.tsx)

Resultado:

- `admin/users` y `role-requests` ya muestran `empty state` y error visible en ramas de carga fallida;
- protección explícita frente a autorrevocación de `ADMIN`;
- el `navbar` cubre mejor ramas móviles y navegación por rol sin carrito espurio.

### Bloque 6

- [`/Users/machinehead/Documents/TFM/frontend/__tests__/provider-support-page.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/provider-support-page.test.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/__tests__/runner-support-page.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/runner-support-page.test.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/__tests__/profile-support-page.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/profile-support-page.test.tsx)

Resultado:

- `provider` y `runner` ahora cubren envío de incidencia con `evidenceUrl`, fallo de submit sin perder borrador y toast destructivo;
- `profile/support` ya no degrada en silencio: enseña banner de error y mantiene vista vacía segura;
- se endureció el componente frente a dobles invocaciones y respuestas no-array.

### Bloque 7

- [`/Users/machinehead/Documents/TFM/frontend/__tests__/provider-order-detail-page.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/provider-order-detail-page.test.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/__tests__/runner-order-detail-page.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/runner-order-detail-page.test.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/vitest.setup.ts`](/Users/machinehead/Documents/TFM/frontend/vitest.setup.ts)

Resultado:

- `provider order detail` cubre mejor fallbacks de producto sin nombre, reparto ausente y soporte vacío;
- `runner order detail` cubre ahora contexto operativo escaso y ausencia real de `route param`;
- `jsdom` deja de ensuciar la suite con `Not implemented: navigation to another Document` al clicar enlaces reales en tests.

### Bloque 8

- [`/Users/machinehead/Documents/TFM/frontend/__tests__/navbar-role-locale.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/navbar-role-locale.test.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/__tests__/profile-support-page.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/profile-support-page.test.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/components/navbar.tsx`](/Users/machinehead/Documents/TFM/frontend/components/navbar.tsx)

Resultado:

- `navbar` ahora cubre cliente puro con `dashboard` a `/dashboard`, carrito visible sin badge `0`, link de marca y cambio de locale usando el `pathname` actual;
- en móvil, pulsar el locale actual ya no dispara navegación redundante;
- `profile/support` ahora cubre contadores abiertos/cerrados y payloads no-array sin romper la vista.

### Bloque 9

- [`/Users/machinehead/Documents/TFM/frontend/__tests__/provider-order-detail-page.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/provider-order-detail-page.test.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/__tests__/runner-order-detail-page.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/runner-order-detail-page.test.tsx)

Resultado:

- `provider order detail` ya cubre estados `DELIVERED`, `FAILED`, `COMPLETED` y `RESOLVED` dentro del mismo hub;
- `runner order detail` ya cubre estados `DELIVERED`, `PAID`, `PICKED_UP`, `REJECTED` y `FAILED`;
- ambos hubs suben de forma visible en ramas porque dejan de depender solo del escenario medio feliz.

### Bloque 10

- [`/Users/machinehead/Documents/TFM/frontend/__tests__/navbar-role-locale.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/navbar-role-locale.test.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/__tests__/profile-support-page.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/profile-support-page.test.tsx)

Resultado:

- `navbar` ya cubre cierre real del drawer al navegar por `cart`, `dashboard`, `inventory`, `deliveries`, `profile` y `register`;
- `navbar` queda muy alto en líneas y funciones porque casi todas las closures móviles y de locale ya están defendidas;
- `profile/support` añade mapeos menos comunes de incidentes y refunds (`ADDRESS_PROBLEM`, `SAFETY_CONCERN`, `WRONG_DELIVERY`, `PROVIDER_FULL`, `DELIVERY_FULL`, `APPROVED`, `FAILED`, `EXECUTING`) y sube de forma clara en ramas.

### Bloque 11

- [`/Users/machinehead/Documents/TFM/frontend/__tests__/provider-support-page.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/provider-support-page.test.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/__tests__/runner-support-page.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/runner-support-page.test.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/__tests__/admin-user-detail-page.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/admin-user-detail-page.test.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/__tests__/runner-order-detail-page.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/runner-order-detail-page.test.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/app/[locale]/provider/support/page.tsx`](/Users/machinehead/Documents/TFM/frontend/app/[locale]/provider/support/page.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/app/[locale]/runner/support/page.tsx`](/Users/machinehead/Documents/TFM/frontend/app/[locale]/runner/support/page.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/app/[locale]/admin/users/[id]/page.tsx`](/Users/machinehead/Documents/TFM/frontend/app/[locale]/admin/users/[id]/page.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/app/[locale]/runner/orders/[id]/page.tsx`](/Users/machinehead/Documents/TFM/frontend/app/[locale]/runner/orders/[id]/page.tsx)

Resultado:

- `provider/runner support` ya no asumen respuestas perfectas: blindan payloads no-array, muestran banner visible al fallar la carga principal y mantienen estado seguro vacío;
- `admin user detail` sigue siendo usable si falla solo el historial de gobernanza, con toast destructivo y detalle principal intacto;
- `runner order detail` deja de enseñar estados crudos desconocidos y degrada a `Sin estado`;
- se limpiaron varias specs frágiles que dependían de `mockResolvedValueOnce` con efectos dobles y se sustituyeron por mocks estables o `mockReset()` real por test.

### Bloque 12

- [`/Users/machinehead/Documents/TFM/frontend/__tests__/provider-order-detail-page.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/provider-order-detail-page.test.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/__tests__/runner-order-detail-page.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/runner-order-detail-page.test.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/app/[locale]/provider/sales/[providerOrderId]/page.tsx`](/Users/machinehead/Documents/TFM/frontend/app/[locale]/provider/sales/[providerOrderId]/page.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/app/[locale]/runner/orders/[id]/page.tsx`](/Users/machinehead/Documents/TFM/frontend/app/[locale]/runner/orders/[id]/page.tsx)

Resultado:

- `provider order detail` ya degrada estados raíz, del comercio y del reparto a `Sin estado` en vez de mostrar literales crudos inesperados;
- `provider` y `runner` detail ya blindan `refunds/incidents` no-array sin romper la ficha operativa;
- las suites de ambos hubs ya usan `mockReset()` en vez de arrastrar implementaciones viejas, y cubren mejor degradación por payloads anómalos.

### Bloque 13

- [`/Users/machinehead/Documents/TFM/frontend/__tests__/admin-refunds-page.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/admin-refunds-page.test.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/__tests__/admin-refund-detail-page.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/admin-refund-detail-page.test.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/__tests__/admin-incident-detail-page.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/admin-incident-detail-page.test.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/app/[locale]/admin/refunds/page.tsx`](/Users/machinehead/Documents/TFM/frontend/app/[locale]/admin/refunds/page.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/app/[locale]/admin/refunds/[id]/page.tsx`](/Users/machinehead/Documents/TFM/frontend/app/[locale]/admin/refunds/[id]/page.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/app/[locale]/admin/incidents/[id]/page.tsx`](/Users/machinehead/Documents/TFM/frontend/app/[locale]/admin/incidents/[id]/page.tsx)

Resultado:

- `admin/refunds` ya blinda payloads no-array, deja banner visible si falla la cola y mantiene empty state seguro;
- `refund detail` e `incident detail` ya cubren ausencia real de enlaces de contexto y evidencia vacía;
- este bloque empuja sobre todo ramas de `admin` y deja el global en `79.34%` de branches, ya muy cerca del umbral del `80%`.

### Bloque 14

- [`/Users/machinehead/Documents/TFM/frontend/__tests__/provider-support-page.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/provider-support-page.test.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/__tests__/runner-support-page.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/runner-support-page.test.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/__tests__/provider-order-detail-page.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/provider-order-detail-page.test.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/__tests__/runner-order-detail-page.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/runner-order-detail-page.test.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/app/[locale]/runner/support/page.tsx`](/Users/machinehead/Documents/TFM/frontend/app/[locale]/runner/support/page.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/app/[locale]/runner/orders/[id]/page.tsx`](/Users/machinehead/Documents/TFM/frontend/app/[locale]/runner/orders/[id]/page.tsx)

Resultado:

- `provider/runner support` ya cubren submit sin `evidenceUrl`, persistencia de selección tras recarga y matrices más completas de estados de `refund` e `incident`;
- `provider order detail` y `runner order detail` ya validan muchos más estados de dominio reales (`ACCEPTED`, `PREPARING`, `REJECTED_BY_STORE`, `ASSIGNED`, `PAYMENT_READY`, `REQUESTED`, `APPROVED`, `EXECUTING`, `COMPLETED`, `OPEN`, `RESOLVED`, etc.);
- en `runner/support` y `runner detail` se eliminaron ramas muertas derivadas del propio contrato interno del componente, de modo que el coverage refleja mejor rutas realmente alcanzables;
- este bloque cruza por fin el umbral objetivo y deja el global frontend en `82.39%` de `branches`.

### Bloque 15

- [`/Users/machinehead/Documents/TFM/frontend/__tests__/admin-masters-page.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/admin-masters-page.test.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/__tests__/order-detail-page.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/order-detail-page.test.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/__tests__/provider-order-card.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/provider-order-card.test.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/__tests__/runner-active-order-view.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/runner-active-order-view.test.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/__tests__/provider-order-detail-page.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/provider-order-detail-page.test.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/__tests__/runner-order-detail-page.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/runner-order-detail-page.test.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/app/[locale]/runner/orders/[id]/page.tsx`](/Users/machinehead/Documents/TFM/frontend/app/[locale]/runner/orders/[id]/page.tsx)

Resultado:

- `admin/masters` deja de ser un hotspot serio: cubre fallback real al tab por defecto, variantes SMTP (`local-default`, `secure`, auth/password no configurados) y errores de carga/guardado/prueba;
- `order detail` sube con matrices más completas de vocabulario de negocio, fallback de dirección, reparto y productos, además de la rama de `route param` ausente;
- `ProviderOrderCard` y `RunnerActiveOrderView` pasan a cobertura prácticamente completa en ramas reales, con fallbacks de nombres, tiempos, estado desconocido y tramos sin ruta;
- `runner order detail` queda en `100%` al eliminar defensas muertas y cubrir la matriz completa de estados visibles;
- este bloque dejó la foto global en `84.21%` de `branches`, con `352` tests y `92.12%` de líneas.

## Bugs reales detectados y corregidos durante la campaña

- [`/Users/machinehead/Documents/TFM/frontend/app/[locale]/provider/support/page.tsx`](/Users/machinehead/Documents/TFM/frontend/app/[locale]/provider/support/page.tsx)
  - la carga principal no degradaba bien si fallaba `ordersService.getAll()`.
- [`/Users/machinehead/Documents/TFM/frontend/app/[locale]/runner/support/page.tsx`](/Users/machinehead/Documents/TFM/frontend/app/[locale]/runner/support/page.tsx)
  - mismo problema de degradación segura en carga principal.
- [`/Users/machinehead/Documents/TFM/frontend/app/[locale]/admin/refunds/[id]/page.tsx`](/Users/machinehead/Documents/TFM/frontend/app/[locale]/admin/refunds/[id]/page.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/app/[locale]/admin/incidents/[id]/page.tsx`](/Users/machinehead/Documents/TFM/frontend/app/[locale]/admin/incidents/[id]/page.tsx)
  - el salto a la ficha del runner usaba `deliveryOrderId` cuando la ruta real del hub trabaja sobre `orderId`.
- [`/Users/machinehead/Documents/TFM/frontend/app/[locale]/profile/support/page.tsx`](/Users/machinehead/Documents/TFM/frontend/app/[locale]/profile/support/page.tsx)
  - la carga degradaba en silencio y asumía respuestas tipo array; ahora muestra error visible y blinda respuestas no válidas.
- [`/Users/machinehead/Documents/TFM/frontend/vitest.setup.ts`](/Users/machinehead/Documents/TFM/frontend/vitest.setup.ts)
  - el entorno de test dejaba navegar enlaces reales en `jsdom` y generaba ruido repetido; ahora lo previene de forma global sin romper handlers de UI.
- [`/Users/machinehead/Documents/TFM/frontend/components/navbar.tsx`](/Users/machinehead/Documents/TFM/frontend/components/navbar.tsx)
  - el selector de locale en móvil disparaba `router.replace` incluso cuando el usuario pulsaba el idioma ya activo; ahora lo ignora.
- [`/Users/machinehead/Documents/TFM/frontend/app/[locale]/admin/users/[id]/page.tsx`](/Users/machinehead/Documents/TFM/frontend/app/[locale]/admin/users/[id]/page.tsx)
  - si fallaba el historial de gobernanza se caía toda la experiencia del detalle; ahora el admin conserva el detalle principal y ve el fallo solo en la sección afectada.
- [`/Users/machinehead/Documents/TFM/frontend/app/[locale]/runner/orders/[id]/page.tsx`](/Users/machinehead/Documents/TFM/frontend/app/[locale]/runner/orders/[id]/page.tsx)
  - mostraba literales desconocidos de estado/pago en vez de un fallback humano; ahora degrada a `Sin estado`.
- [`/Users/machinehead/Documents/TFM/frontend/app/[locale]/provider/sales/[providerOrderId]/page.tsx`](/Users/machinehead/Documents/TFM/frontend/app/[locale]/provider/sales/[providerOrderId]/page.tsx)
  - estados desconocidos y payloads secundarios no válidos podían filtrarse como texto crudo o dejar ramas poco robustas; ahora la ficha degrada de forma segura y mantiene contexto utilizable.
- [`/Users/machinehead/Documents/TFM/frontend/app/[locale]/admin/refunds/page.tsx`](/Users/machinehead/Documents/TFM/frontend/app/[locale]/admin/refunds/page.tsx)
  - la cola asumía arrays válidos y solo avisaba por toast; ahora blinda el payload y muestra error visible manteniendo estado vacío seguro.
- [`/Users/machinehead/Documents/TFM/frontend/app/[locale]/admin/refunds/[id]/page.tsx`](/Users/machinehead/Documents/TFM/frontend/app/[locale]/admin/refunds/[id]/page.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/app/[locale]/admin/incidents/[id]/page.tsx`](/Users/machinehead/Documents/TFM/frontend/app/[locale]/admin/incidents/[id]/page.tsx)
  - ambos detalles asumían saltos de contexto siempre presentes; ahora degradan bien cuando el caso no tiene enlaces adicionales o evidencia utilizable.
- [`/Users/machinehead/Documents/TFM/frontend/__tests__/provider-support-page.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/provider-support-page.test.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/__tests__/runner-support-page.test.tsx`](/Users/machinehead/Documents/TFM/frontend/__tests__/runner-support-page.test.tsx)
  - varias specs dependían de `clearAllMocks()` y `mockResolvedValueOnce`, lo que dejaba implementaciones persistentes entre tests; ahora cada suite resetea mocks de verdad y evita falsos negativos por doble efecto.
- [`/Users/machinehead/Documents/TFM/frontend/app/[locale]/runner/support/page.tsx`](/Users/machinehead/Documents/TFM/frontend/app/[locale]/runner/support/page.tsx)
- [`/Users/machinehead/Documents/TFM/frontend/app/[locale]/runner/orders/[id]/page.tsx`](/Users/machinehead/Documents/TFM/frontend/app/[locale]/runner/orders/[id]/page.tsx)
  - había ramas imposibles mantenidas por defensas redundantes sobre `deliveryOrder.id`; ahora el contrato interno del estado queda más explícito y el coverage deja de penalizar rutas no alcanzables.

## Validación focalizada ya pasada

- bloque `support + navbar + track`: `4 files`, `24 tests`, `OK`
- bloque `admin support`: `4 files`, `14 tests`, `OK`
- validación conjunta del endurecimiento de specs: `13 files`, `71 tests`, `OK`
- bloque `profile + order detail + finance hubs`: `4 files`, `23 tests`, `OK`
- bloque `admin users + role requests + navbar`: `4 files`, `21 tests`, `OK`
- bloque `support por rol + support inbox cliente`: `3 files`, `16 tests`, `OK`
- bloque `provider/runner detail + jsdom hardening`: `2 files`, `11 tests`, `OK`
- bloque `navbar + support inbox counters`: `2 files`, `17 tests`, `OK`
- bloque `provider/runner detail statuses`: `2 files`, `13 tests`, `OK`
- bloque `navbar drawer flows + support rare labels`: `2 files`, `20 tests`, `OK`
- bloque `support por rol + admin user detail + runner detail fallback`: `4 files`, `27 tests`, `OK`
- suite global `frontend test:cov -- --maxWorkers=1`: `73 files`, `323 tests`, `OK`
- bloque `provider/runner detail payload hardening`: `2 files`, `15 tests`, `OK`
- suite global `frontend test:cov -- --maxWorkers=1`: `73 files`, `325 tests`, `OK`
- bloque `admin refunds/incidents branch hardening`: `3 files`, `15 tests`, `OK`
- suite global `frontend test:cov -- --maxWorkers=1`: `73 files`, `329 tests`, `OK`
- bloque `support/detail state matrix hardening`: `4 files`, `42 tests`, `OK`
- suite global `frontend test:cov -- --maxWorkers=1`: `73 files`, `343 tests`, `OK`
- bloque `masters + order detail + order cards`: `4 files`, `28 tests`, `OK`
- suite global `frontend test:cov -- --maxWorkers=1`: `73 files`, `352 tests`, `OK`
- snapshot actual recalculada tras el cierre documental: `73 files`, `356 tests`, `91.13%` statements, `84.41%` branches, `93.27%` functions, `92.20%` lines, `OK`

## Siguiente cola priorizada

- [`/Users/machinehead/Documents/TFM/frontend/lib/runtime-config.ts`](/Users/machinehead/Documents/TFM/frontend/lib/runtime-config.ts) `54.28% branches`
- [`/Users/machinehead/Documents/TFM/frontend/app/[locale]/dashboard/page.tsx`](/Users/machinehead/Documents/TFM/frontend/app/[locale]/dashboard/page.tsx) `62.50% branches`
- [`/Users/machinehead/Documents/TFM/frontend/lib/services/payments-service.ts`](/Users/machinehead/Documents/TFM/frontend/lib/services/payments-service.ts) `64.28% branches`
- [`/Users/machinehead/Documents/TFM/frontend/app/[locale]/provider/finance/page.tsx`](/Users/machinehead/Documents/TFM/frontend/app/[locale]/provider/finance/page.tsx) `65.00% branches`
- [`/Users/machinehead/Documents/TFM/frontend/app/[locale]/admin/refunds/page.tsx`](/Users/machinehead/Documents/TFM/frontend/app/[locale]/admin/refunds/page.tsx) `70.73% branches`
- [`/Users/machinehead/Documents/TFM/frontend/app/[locale]/orders/[id]/track/page.tsx`](/Users/machinehead/Documents/TFM/frontend/app/[locale]/orders/[id]/track/page.tsx) `70.10% branches`
- [`/Users/machinehead/Documents/TFM/frontend/app/[locale]/runner/finance/page.tsx`](/Users/machinehead/Documents/TFM/frontend/app/[locale]/runner/finance/page.tsx) `71.42% branches`
- [`/Users/machinehead/Documents/TFM/frontend/app/[locale]/provider/products/page.tsx`](/Users/machinehead/Documents/TFM/frontend/app/[locale]/provider/products/page.tsx) `72.22% branches`
- [`/Users/machinehead/Documents/TFM/frontend/app/[locale]/runner/page.tsx`](/Users/machinehead/Documents/TFM/frontend/app/[locale]/runner/page.tsx) `77.77% branches`
- [`/Users/machinehead/Documents/TFM/frontend/components/tracking/DeliveryMap.tsx`](/Users/machinehead/Documents/TFM/frontend/components/tracking/DeliveryMap.tsx) `78.57% branches`

La prioridad no es solo subir `coverage`, sino empujar el conjunto hacia specs que representen confianza operativa real.
