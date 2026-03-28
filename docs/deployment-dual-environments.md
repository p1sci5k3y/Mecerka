# Despliegue Dual: Demo Y Producción

Este repositorio despliega el mismo artefacto de aplicación en dos entornos aislados:

- `mecerka.me` as production
- `demo.mecerka.me` as demo

## Modelo de despliegue

- Las imágenes se construyen desde el mismo commit.
- El workflow despliega una imagen de backend y una de frontend.
- La misma base de código se usa en ambos stacks.
- El comportamiento específico de cada entorno se controla con secretos, runtime config y aislamiento de datos.

## Reglas de aislamiento

Demo y producción no deben compartir:

- database name
- persistent volume
- Stripe credentials
- mail configuration
- JWT / fiscal secrets
- demo mode
- demo password

El aislamiento se fuerza mediante:

- two environment files rendered on the server
- two Compose projects
- separate host ports behind Nginx
- runtime-only frontend config under the same host using `"/api"`

## Secrets y variables necesarios en GitHub

El workflow de despliegue espera valores separados con prefijos `PROD_*` y `DEMO_*`.

Examples:

- `PROD_POSTGRES_PASSWORD`
- `DEMO_POSTGRES_PASSWORD`
- `PROD_STRIPE_SECRET_KEY`
- `DEMO_STRIPE_SECRET_KEY`
- `PROD_MAIL_HOST`
- `DEMO_MAIL_HOST`
- `PROD_BACKEND_URL=https://mecerka.me/api`
- `DEMO_BACKEND_URL=https://demo.mecerka.me/api`
- `PROD_DEMO_MODE=false`
- `DEMO_DEMO_MODE=true`
- `DEMO_DEMO_PASSWORD`

The workflow also needs:

- `EC2_HOST`
- `EC2_USERNAME`
- `EC2_SSH_KEY`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `GHCR_USERNAME`
- `GHCR_TOKEN`
- `LETSENCRYPT_EMAIL`

## Proxy inverso y TLS

`infrastructure/nginx.conf` routes:

- `mecerka.me` and `www.mecerka.me`
- `demo.mecerka.me`

TLS se gestiona con Certbot durante el despliegue, seguido de `nginx -t`, recarga y smoke checks públicos.

## Modelo operativo de SMTP

El despliegue sigue soportando SMTP conducido por entorno mediante `PROD_MAIL_*` y `DEMO_MAIL_*`.

Además, la aplicación ahora expone configuración SMTP gestionable desde admin:

- infraestructura puede mantener el correo completamente gobernado por secrets de entorno
- operadores self-hosted pueden sobrescribir SMTP desde la UI admin
- el origen efectivo se muestra como `environment`, `database` o `default`

## Política de reseteo de la demo

El stack demo se recrea desde un volumen limpio en cada despliegue para que la demo pública no acumule datos de negocio obsoletos entre releases.

## Estado actual validado

A `28/03/2026`, el estado observable es:

- `https://mecerka.me/` and `https://mecerka.me/api/health` respond `200`
- `https://demo.mecerka.me/` and `https://demo.mecerka.me/api/health` respond `200`
- `https://demo.mecerka.me/runtime-config` serves `"/api"` and Stripe dummy
- el login admin demo alcanza `/api/admin/email-settings`
- el resumen SMTP es visible y actualmente resuelve desde `environment` en la demo pública

## Infraestructura externa pendiente

El repositorio no aprovisiona por sí mismo:

- DNS
- cloud secrets
- GHCR access on the target host
- SMTP provider accounts such as AWS SES
