# Entorno Demo

## Propósito

El entorno demo permite a evaluadores y tribunal recorrer la plataforma real con datos reproducibles. No es un frontend fake separado: es la misma aplicación y la misma API, aisladas por datos y `runtime config`.

## Demo mode es opt-in

`DEMO_MODE` está desactivado por defecto en la configuración entregada.

Para habilitar demo mode en local:

```env
DEMO_MODE=true
DEMO_PASSWORD=choose-a-demo-password
```

`DEMO_PASSWORD` es obligatoria cuando el demo mode está activo.

## Estrategia de seeding

### Base seed

Siempre corre y garantiza datos estructurales:

- cities
- categories

### Demo seed

Solo corre cuando `DEMO_MODE=true`.

Crea:

- demo users
- demo products
- demo orders
- demo deliveries
- demo support/refund scenarios
- ciudades demo con providers, runners y catálogo mixto por categorías

## Endpoints demo

- `POST /demo/seed`
- `POST /demo/reset`
- endpoints demo de confirmación de pago para provider y runner

Estas rutas están protegidas por:

- autenticación JWT
- MFA completado
- rol `ADMIN`

## Usuarios demo

El dataset demo incluye:

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

Todos los usuarios demo comparten `DEMO_PASSWORD`.

## Ciudades y verticales demo

El seed demo actual construye un ecosistema local repartido por varias ciudades:

- `Toledo`: panadería y cerámica
- `Madrid`: flores y papelería artesanal
- `Valencia`: huerta y textil
- `Sevilla`: despensa y cuero
- `Bilbao`: café y velas

Cada ciudad dispone de providers propios, runners asociados y al menos un escenario operativo demostrable del lifecycle.

## Comportamiento validado en la demo pública

A `28/03/2026`, la demo pública se puede observar con:

- login operativo para `CLIENT`, `PROVIDER`, `RUNNER` y `ADMIN`
- acceso de `CLIENT` a pedidos, pagos, tracking, incidencias y devoluciones
- acceso de `PROVIDER` y `RUNNER` a hubs operativos y financieros
- acceso de `ADMIN` a usuarios, refunds, incidents y email settings

Matiz importante:

- `PROVIDER` y `RUNNER` support es hoy más fuerte en hubs contextuales (`provider/support`, `runner/support`, order/delivery detail) que en endpoints role-global `/me`
- este es un estado de producto válido, pero todavía no es una inbox global unificada de soporte para esos roles

## Consideraciones de seguridad

> [!CAUTION]
> `DEMO_MODE` no debe activarse nunca sobre un tenant real con usuarios vivos o datos de negocio reales.

- `DEMO_PASSWORD` sigue siendo obligatoria
- las contraseñas demo deben seguir siendo fuertes
- en despliegues cloud, `DEMO_PASSWORD` debe venir de secrets, nunca de código committeado
