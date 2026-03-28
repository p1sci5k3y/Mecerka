# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/)
y este proyecto sigue [Semantic Versioning](https://semver.org/lang/es/).

## [Unreleased]

### Added

- centro de `Mis pedidos` para cliente con separación entre pedidos pendientes e histórico
- centro de `Pagos y tarjetas` en perfil, dejando explícito el estado actual de métodos de pago
- centro de finanzas para `PROVIDER` con visibilidad de Stripe Connect, cobros y refunds ligados a `ProviderOrder`
- centro de finanzas para `RUNNER` con visibilidad de Stripe Connect, cobros completados y pendientes
- flujo demo de pago fake para provider y runner cuando el runtime usa Stripe dummy
- soporte de tracking para pedidos reales con UUID
- documentación actualizada en README y wiki con métricas, credenciales demo y arquitectura vigente
- cobertura frontend real con `@vitest/coverage-v8` y artifacts en CI
- nuevo bloque de tests frontend sobre `login`, `cart`, `payments`, `orders`, `admin`, `runner`, `provider` y servicios asociados
- centros de soporte para `CLIENT`, `PROVIDER` y `RUNNER`
- backoffice admin de incidencias, refunds y gobierno con detalle de caso
- configuración SMTP desde `ADMIN -> Masters -> Correo SMTP`

### Changed

- la demo pública usa la misma app y el mismo circuito real que producción, aislando datos e integraciones por entorno
- `runtime-config` queda forzado a `/api` bajo el mismo host para evitar cruces demo -> prod
- la cobertura frontend recalculada queda en `86.28%` líneas (`274` tests, `73` archivos)
- el backend recalculado queda en `95.27%` líneas (`1238` tests, `122` suites)
- la documentación principal se corrige de nuevo para reflejar el estado real actual de coverage entre frontend y backend
- despliegue dual endurecido con preflight de secrets, limpieza de puertos, warmup de Nginx y smoke checks más robustos
- `security.yml` ahora pasa `GITHUB_TOKEN` explícitamente a Gitleaks en PRs
- `ci.yml` usa la CLI local de Prisma vía `npm exec -- prisma ...` para evitar incompatibilidades del runner con Prisma 7
- dependencias `picomatch` fijadas a versiones seguras en lockfiles raíz, backend y frontend
- demo seed alineada para que las cuentas compartan credenciales conocidas y el dataset pueda reseedearse de forma consistente
- el correo admite configuración efectiva desde panel admin, con fallback a entorno

### Fixed

- corrección de enlaces rotos y copy no localizado en navbar, footer y páginas públicas
- corrección de `runtime-config` bajo rutas con locale
- corrección del tracking que rompía con pedidos UUID
- corrección de métricas y narrativa técnica desalineadas en README, PROJECT_STATUS y wiki
- eliminación de imports no usados en `provider/finance/page.tsx`
- endurecimiento de tests de bootstrap, cart sync y otras rutas sensibles para evitar flakes en CI
- correcciones de Nginx y deploy dual:
  - certificado propio para `demo.mecerka.me`
  - eliminación de opciones IPv6 duplicadas
  - arranque de `nginx` cuando el servicio no estaba activo
  - liberación de puertos ocupados antes del `docker compose up`

## [2026-03-27]

### Added

- actualización de `PROJECT_STATUS.md` con estado real del repo, métricas verificadas y prioridades actuales
- actualización de `CHANGELOG.md` para reflejar el circuito actual cliente/provider/runner/demo
- validación documentada del circuito completo `CLIENT -> orders -> payments -> demo pay -> track` en `demo.mecerka.me`
- nuevo bloque de specs backend sobre wiring, DTOs, utilidades, controladores y repositorios para elevar el suelo de cobertura por fichero

## [2026-03-26]

### Added

- credenciales demo unificadas y documentadas para cuentas `admin`, `provider`, `runner` y `client`
- endpoints demo para cerrar pagos fake del circuito cuando Stripe no está activo de verdad

### Changed

- cierre visible del circuito cliente post-checkout:
  - pagos -> pedidos
  - pagos -> tracking
  - mensaje explícito cuando ya no quedan pagos pendientes

### Fixed

- despliegue dual endurecido hasta dejar `mecerka.me` y `demo.mecerka.me` operativos con healthchecks públicos correctos

## [2026-03-24]

### Added

- auditoría priorizada de casos de uso en:
  - [/Users/machinehead/Documents/TFM/docs/use-case-audit-priority.md](/Users/machinehead/Documents/TFM/docs/use-case-audit-priority.md)
- especificación funcional de cancelación y reembolso en:
  - [/Users/machinehead/Documents/TFM/docs/cancel-refund-use-case-spec.md](/Users/machinehead/Documents/TFM/docs/cancel-refund-use-case-spec.md)
- cobertura frontend y backend publicada como métrica verificable en documentación

### Changed

- README y wiki alineados con la arquitectura y despliegue dual reales
- documentación de producto reorientada a casos de uso reales en vez de historia de slices antiguos

### Fixed

- validación de smoke checks y deploy sobre demo/prod con runtime config aislado
