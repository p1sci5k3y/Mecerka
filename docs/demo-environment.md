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

## Endpoints demo

- `POST /demo/seed`
- `POST /demo/reset`
- demo payment confirmation endpoints for provider and runner

These routes are protected by:

- JWT authentication
- MFA completion
- admin role

## Usuarios demo

El dataset demo incluye:

- `admin.demo@local.test`
- `provider.demo@local.test`
- `provider2.demo@local.test`
- `runner.demo@local.test`
- `runner2.demo@local.test`
- `user.demo@local.test`
- `user2.demo@local.test`

Todos los usuarios demo comparten `DEMO_PASSWORD`.

## Comportamiento validado en la demo pública

At `28/03/2026`, the public demo is observable with:

- login working for `CLIENT`, `PROVIDER`, `RUNNER`, `ADMIN`
- `CLIENT` access to orders, payments, track, incidents, and refunds
- `PROVIDER` and `RUNNER` access to operational and finance hubs
- `ADMIN` access to users, refunds, incidents, and email settings

Matiz importante:

- `PROVIDER` and `RUNNER` support is currently stronger in contextual hubs (`provider/support`, `runner/support`, order/delivery detail) than in role-global `/me` endpoints
- este es un estado de producto válido, pero todavía no es una inbox global unificada de soporte para esos roles

## Consideraciones de seguridad

> [!CAUTION]
> `DEMO_MODE` must never be enabled on a real production tenant with live users or live business data.

- `DEMO_PASSWORD` is mandatory
- las contraseñas demo deben seguir siendo fuertes
- in cloud deployments, `DEMO_PASSWORD` must come from secrets, never from committed source
