# Entorno De Pruebas Demo

## Propósito del Demo Mode

El demo mode proporciona un dataset reproducible del marketplace para que evaluadores y tribunal puedan recorrer la plataforma sin preparación manual.

Está diseñado para:

- crear usuarios coherentes para todos los roles principales;
- crear providers, runners y productos demo con imágenes en varias ciudades;
- generar pedidos de ejemplo en distintas fases del ciclo de vida y en distintos verticales;
- permitir ejecuciones repetidas de pruebas end-to-end mediante `reset + reseed`.

El entorno demo queda aislado a cuentas de prueba bajo `@local.test`.

Cuando el demo mode se habilita explícitamente, el backend siembra este dataset al arrancar si los registros demo todavía no existen.

El demo mode exige una `DEMO_PASSWORD` explícita. El backend no entrega una contraseña demo embebida.

## Arranque rápido

1. Arrancar PostgreSQL.
2. Arrancar el backend.
3. Arrancar el frontend.
4. Iniciar sesión con los usuarios demo y recorrer la plataforma.
5. Si necesitas una línea base limpia, autenticarte como admin y llamar a `POST /demo/reset`.

Ejemplo de flujo de reset:

```bash
curl -c cookies.txt -X POST http://127.0.0.1:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin.demo@local.test","password":"<admin-password>"}'

curl -b cookies.txt -X POST http://127.0.0.1:3000/demo/reset
```

`/demo/reset` es solo para `ADMIN`.

## Cómo resetear el entorno

Endpoints disponibles:

- `POST /demo/seed`
- `POST /demo/reset`

Comportamiento:

- `POST /demo/seed`
  - crea el dataset demo
  - si los datos demo ya existen, primero hace reset
- `POST /demo/reset`
  - elimina datos exclusivos de demo para `*@local.test`
  - vuelve a sembrar automáticamente
  - devuelve:

```json
{
  "status": "reset_complete"
}
```

Esto hace deterministas las pruebas manuales repetidas y las reruns de Playwright.

## Usuarios de prueba

Cuentas demo por defecto:

- `admin.demo@local.test`
- `user.demo@local.test`
- `user2.demo@local.test`
- `provider.demo@local.test`
- `provider2.demo@local.test`
- `madrid.provider.demo@local.test`
- `madrid.crafts.demo@local.test`
- `valencia.provider.demo@local.test`
- `valencia.crafts.demo@local.test`
- `sevilla.provider.demo@local.test`
- `sevilla.crafts.demo@local.test`
- `bilbao.provider.demo@local.test`
- `bilbao.crafts.demo@local.test`
- `runner.demo@local.test`
- `runner2.demo@local.test`
- `madrid.runner.demo@local.test`
- `valencia.runner.demo@local.test`
- `sevilla.runner.demo@local.test`
- `bilbao.runner.demo@local.test`

Todas estas cuentas usan la contraseña configurada en `DEMO_PASSWORD`.

La suite de Playwright también soporta leerlas desde [`frontend/.env.test`](../frontend/.env.test).

Roles:

- `admin.demo@local.test`: `ADMIN`
- `*.provider.demo@local.test` y `provider*.demo@local.test`: `PROVIDER`
- `*.runner.demo@local.test` y `runner*.demo@local.test`: `RUNNER`
- `user.demo@local.test` y `user2.demo@local.test`: `CLIENT`

## Providers demo

Los negocios sembrados para provider ya representan un ecosistema local variado:

- `Toledo`: `Panadería San Isidro`, `Cerámica del Miradero`
- `Madrid`: `Flores de la Plaza`, `Cuadernos de Malasaña`
- `Valencia`: `Huerta del Turia`, `Seda del Carmen`
- `Sevilla`: `Despensa de Triana`, `Marroquinería Giralda`
- `Bilbao`: `Café Casco Viejo`, `Velas de Bilbao`

Estos providers se crean a través de los servicios de dominio existentes y reciben bootstrap de cuentas de pago demo para que los flujos del marketplace funcionen en local y en demo mode.

## Productos demo

El catálogo demo ya mezcla alimentación y comercio no alimentario, por ejemplo:

- `Pan artesano`
- `Cuenco de cerámica toledana`
- `Ramo de temporada`
- `Cuadernos cosidos a mano`
- `Naranjas dulces`
- `Camino de mesa de seda`
- `Cartera de piel`
- `Café de tueste local`
- `Vela aromática del Nervión`

Las imágenes se sirven desde:

- [`frontend/public/demo-products`](../frontend/public/demo-products)

Cada producto demo incluye:

- name
- price
- provider
- category
- `imageUrl`

## Lifecycle de pedido en demo

El demo seed crea escenarios visibles en varias ciudades, incluyendo:

- 1 pedido multiproveedor pendiente en Toledo
- 1 reparto en tránsito en Madrid
- 1 entrega completada en Valencia
- 1 entrega asignada en Sevilla
- 1 caso con soporte abierto en Bilbao

Características operativas:

- cada ciudad tiene runners asociados al seed
- las ubicaciones demo del runner se siembran para los flujos de tracking
- los provider orders se crean de forma consistente con la lógica existente de pedido y pago
- el estado de entrega se representa a través del dominio real de delivery, no mediante escrituras directas a base de datos

Estados típicos visibles durante las pruebas:

- pending / payment-ready order
- assigned / pickup flow / delivering order
- delivered order
- support/refund linked order

## Coverage Playwright

La cobertura actual de Playwright vive en:

- [`frontend/e2e`](../frontend/e2e)
- [`frontend/tests/e2e`](../frontend/tests/e2e)

Recorridos cubiertos:

- Auth
  - demo login
  - invalid login rejection
- User
  - browse products
  - add products to cart
  - create and view orders
  - multi-provider order aggregation
- Provider
  - create product
  - update product
  - review provider orders
  - advance provider-order status
- Runner
  - view assigned deliveries
  - progress delivery lifecycle
- Admin
  - inspect dashboard metrics
  - list users/providers
  - inspect orders through admin-capable flows

La suite E2E resetea los datos demo antes de las pruebas para que cada ejecución parta de una línea base conocida.

Como el módulo demo escribe datos reales de aplicación a través de servicios existentes, tanto las pruebas manuales como Playwright necesitan que el backend esté conectado al mismo stack con PostgreSQL usado en la ejecución normal.

## Notas

- Los datos demo están pensados solo para pruebas locales y evaluación.
- Las identidades de prueba deben usar dominios `local.test` o `example.test`.
- No deben usarse credenciales de pago reales, correos personales ni datos de producción en demo mode.
