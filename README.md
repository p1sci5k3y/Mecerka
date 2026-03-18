# Mecerka

Plataforma de comercio local con arquitectura modular, backend en **NestJS**, persistencia en **PostgreSQL** mediante **Prisma ORM**, y frontend en **Next.js**.

El proyecto prioriza:

- separación clara entre transporte, aplicación y persistencia;
- control de acceso por rol y por propiedad del recurso;
- privacidad y minimización de datos;
- consistencia transaccional en flujos críticos;
- reproducibilidad mediante Docker y Testcontainers.

## Stack real

- Backend: `Node.js + NestJS`
- Base de datos: `PostgreSQL`
- ORM: `Prisma`
- Frontend: `Next.js`
- Pasarela de pagos: `Stripe`
- Entorno local: `Docker Compose`
- Testing backend: `Jest + Testcontainers`
- Testing frontend: `Playwright`

## Características técnicas verificables

- roles reales: `CLIENT`, `PROVIDER`, `RUNNER`, `ADMIN`
- registro público restringido a `CLIENT`
- flujo autenticado de solicitud de rol para `PROVIDER` y `RUNNER`
- `ADMIN` no autoasignable desde endpoints públicos
- MFA exigido en rutas sensibles
- `fiscalId` nunca almacenado en claro
- protección fiscal mediante `HMAC-SHA256 + FISCAL_PEPPER`
- logging estructurado con redacción recursiva de campos sensibles
- asignación de roles protegida por transacción y `SELECT ... FOR UPDATE`
- `/metrics` protegido para `ADMIN`
- `DEMO_MODE` deshabilitado por defecto y activable solo de forma explícita

## Puesta en marcha

### 1. Generar configuración local segura

```bash
make setup
```

Esto crea `.env` solo si no existe y genera:

- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `JWT_SECRET_CURRENT`
- `FISCAL_PEPPER`

El bootstrap deja `DEMO_MODE=false` por defecto.

### 2. Levantar la pila

```bash
docker compose up -d --build
```

Servicios:

- PostgreSQL
- backend
- frontend
- Mailpit

### 3. Verificar salud del backend

```bash
curl http://localhost:3000/health
```

### 4. Abrir la aplicación

- frontend: `http://localhost:3001`
- backend: `http://localhost:3000`
- Mailpit: `http://localhost:8025`

## Despliegue en producción

El despliegue productivo se ejecuta mediante el workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

El flujo actual:

- se conecta por SSH al host objetivo;
- valida que todas las variables requeridas estén presentes antes de ejecutar Docker Compose;
- escribe una `.env` completa con permisos restrictivos;
- usa [`docker-compose.prod.yml`](docker-compose.prod.yml) sin `container_name` explícitos;
- elimina de forma dirigida los nombres legacy de contenedores si aún existen;
- ejecuta `docker compose down`, `build --pull` y `up -d --force-recreate --remove-orphans`;
- valida Nginx antes de recargarlo.

Esto hace que el despliegue sea **repetible e idempotente** sin hardcodear ni imprimir secretos.

## Modo demo

El modo demo es **opt-in** y está **deshabilitado por defecto**.

Si se desea un entorno de demostración:

1. editar `.env`
2. establecer:

```env
DEMO_MODE=true
DEMO_PASSWORD=elige-una-contraseña-demo
```

3. reiniciar la pila:

```bash
docker compose up -d --build
```

Con `DEMO_MODE=true`, el backend puede auto-sembrar el dataset demo y habilitar los endpoints administrativos de demo. La contraseña de las cuentas demo debe proporcionarse explícitamente mediante `DEMO_PASSWORD`.

## Testing

### Backend

```bash
cd backend
npm run lint
npm run type-check
npm run test
npm run test:e2e
```

La suite backend:

- levanta PostgreSQL efímero con Testcontainers;
- genera `DATABASE_URL` dinámicamente;
- genera secretos efímeros;
- aplica migraciones Prisma antes de ejecutar tests;
- no depende de una base de datos local compartida;
- no depende de SMTP externo, porque en `test`/`E2E` el email usa `jsonTransport`.

### Quality gate completa

```bash
npm run test:ci
```

### Frontend / Playwright

```bash
cd frontend
npm run test:e2e:full
```

La suite Playwright ejecuta el frontend y el backend reales sobre la pila Docker.

## Calidad y DevSecOps

Husky impone quality gates locales:

- `pre-commit`: `lint` + `type-check`
- `pre-push`: `test` + `test:e2e`

`.env` no se versiona y `.env.example` no contiene secretos reales.

## Documentación principal

- [Architecture](docs/architecture.md)
- [Security](docs/security.md)
- [Testing](docs/testing.md)
- [Getting Started](docs/getting-started.md)
- [Demo Environment](docs/demo-environment.md)
- [Observability](docs/observability.md)
- [Final Audit](docs/final-audit.md)
- [SBOM](docs/sbom.md)
