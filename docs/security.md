# Modelo De Seguridad

## Alcance

Este documento describe los controles de seguridad que están implementados y verificables en el código y en las pruebas del repositorio. No promete seguridad absoluta ni controles externos no visibles desde la aplicación.

## Autenticación

La autenticación se basa en JWT con guards de NestJS y sesión por cookie `HttpOnly` en la integración web.

Controles implementados:

- hash de contraseñas con Argon2;
- verificación de email antes del login;
- invalidación de tokens mediante `tokenVersion`;
- MFA con guard específico de completitud;
- rotación de secreto JWT mediante `JWT_SECRET_CURRENT` y `JWT_SECRET_PREVIOUS`.

## Autorización

La autorización se aplica por capas:

1. autenticación JWT;
2. MFA completado en rutas sensibles;
3. RBAC con `RolesGuard` y `@Roles(...)`;
4. comprobaciones de ownership dentro de los servicios.

La afirmación correcta del sistema es **RBAC más ownership de recurso**, no RBAC aislado.

Ejemplos verificados:

- un `CLIENT` solo puede leer sus pedidos;
- un `PROVIDER` solo puede gestionar sus productos y sus `provider orders`;
- un `RUNNER` solo puede operar sobre entregas asignadas;
- las rutas de `ADMIN` están protegidas de forma explícita.

## Escalada De Roles

Los roles implementados son:

- `CLIENT`
- `PROVIDER`
- `RUNNER`
- `ADMIN`

El registro público siempre crea `CLIENT`.

El flujo `POST /users/request-role`:

- exige autenticación;
- exige MFA completado;
- solo admite `PROVIDER` y `RUNNER`;
- exige `country` y `fiscalId`;
- rechaza autoasignación de `ADMIN`;
- ejecuta asignación con transacción y bloqueo.

Las concesiones administrativas reutilizan la misma lógica de dominio, mantienen auditoría y no hacen append ciego de roles.

## Validación De Entrada

La validación global usa:

- `whitelist: true`
- `forbidNonWhitelisted: true`
- `transform: true`

Las rutas sensibles usan DTOs en vez de cuerpos inline, incluidas las de administración y configuración de correo. Esto reduce riesgo de mass assignment y de campos persistence-like inyectados por el cliente.

## Privacidad Y Datos Fiscales

El identificador fiscal no se recoge durante el registro normal.

Solo se solicita cuando un usuario pide `PROVIDER` o `RUNNER`.

El backend no persiste el valor en claro. Guarda:

- `fiscalIdHash`
- `fiscalIdLast4`
- `fiscalCountry`

El hash se calcula con HMAC-SHA256 usando `FISCAL_PEPPER`.

Limitación real:

- se valida formato local para identificadores españoles;
- no existe verificación contra registros externos oficiales.

## Logging Y Redacción

El logger estructurado aplica redacción recursiva sobre campos sensibles, incluyendo:

- passwords;
- tokens y JWT;
- cookies;
- `fiscalId`;
- `fiscalIdHash`;
- `fiscalIdLast4`.

Esto reduce filtrado accidental en trazas operativas, pero no sustituye a una política externa de observabilidad o retención.

## Configuración Operativa De Correo

La plataforma soporta dos orígenes de configuración de correo:

- variables de entorno;
- configuración persistida desde `ADMIN`.

Conectores soportados:

- `SMTP`
- `AWS SES`

### Protección de secretos persistidos

Los secretos de conectores se almacenan en base de datos con:

- cifrado `AES-256-GCM`;
- derivación de clave con `scrypt`;
- fingerprint con `scrypt + salt` para detectar manipulación.

El frontend no vuelve a recibir secretos persistidos una vez guardados. Solo ve un resumen del conector activo y el estado de configuración.

### Clave maestra

En producción, los secretos persistidos requieren `SYSTEM_SETTINGS_MASTER_KEY`.

Reglas actuales:

- en `production`, `SYSTEM_SETTINGS_MASTER_KEY` es obligatoria;
- fuera de producción, se permite fallback a `JWT_SECRET` para compatibilidad local y tests;
- el workflow de despliegue usa un único secret `SYSTEM_SETTINGS_MASTER_KEY` y lo inyecta en ambos stacks.

### Transporte

`SMTP` se abre con TLS verificado salvo el relay local por defecto (`mailpit`).

`AWS SES` usa el SDK oficial sobre HTTPS.

Las rutas admin de configuración de correo rechazan sesiones no HTTPS cuando `NODE_ENV=production`.

## Seguridad De Pagos

Los flujos de pago críticos incluyen:

- verificación de firma de webhooks de Stripe;
- uso de `raw body` para validar la firma;
- validación de metadata;
- comprobación de importes y moneda;
- tratamiento controlado de `payment sessions`;
- salvaguardas de idempotencia en rutas críticas.

La afirmación defendible es **protección fuerte de flujos críticos**, no idempotencia universal de toda la plataforma.

## Rate Limiting

La aplicación usa Nest Throttler globalmente y endurece rutas sensibles como:

- `/auth/register`
- `/auth/login`
- `/auth/resend-verification`
- `/auth/forgot-password`

## Demo Y Separación De Entornos

`DEMO_MODE` está desactivado por defecto.

Demo y producción se aíslan por:

- base de datos;
- secretos JWT y pepper fiscal;
- credenciales Stripe;
- configuración de correo;
- modo demo y contraseña demo;
- `SYSTEM_SETTINGS_MASTER_KEY`.

## Estado Actual De Dependencias

A fecha `28/03/2026`:

- `frontend npm audit --omit=dev` no reporta vulnerabilidades;
- `backend npm audit --omit=dev` no reporta vulnerabilidades;
- el repositorio fija `path-to-regexp@8.4.0` por override para cerrar la cadena transitiva que aparecía en auditorías anteriores.

## Qué No Se Está Afirmando

Este proyecto no debe afirmar:

- zero trust completo;
- verificación fiscal externa;
- imposibilidad absoluta de MITM si el cliente final controla su navegador o su equipo;
- eliminación total de riesgo de autorización solo por usar RBAC.

La afirmación correcta es que el sistema implementa **controles de seguridad por capas, verificables en código y razonables para un producto real en este estado de madurez**.
