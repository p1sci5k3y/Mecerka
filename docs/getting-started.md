# Puesta En Marcha

Esta guía refleja la implementación actual y los defaults que entrega el repositorio.

## 1. Requisitos previos

- Docker y Docker Compose
- Node.js si quieres ejecutar linting o tests fuera de contenedores

## 2. Bootstrap del entorno local

Genera un `.env` local con secretos aleatorios seguros:

```bash
make setup
```

Esto usa `scripts/bootstrap-env.sh`, que:

- crea `.env` solo si todavía no existe;
- genera secretos con `openssl rand`;
- inicializa `JWT_SECRET` y `JWT_SECRET_CURRENT` de forma coherente;
- genera `SYSTEM_SETTINGS_MASTER_KEY` para secretos cifrados persistidos;
- genera `FISCAL_PEPPER`;
- fija `DEMO_MODE=false` por defecto.

El repositorio queda así seguro por defecto respecto al modo demo: **demo mode es opt-in y está desactivado por defecto**.

## 3. Arrancar la plataforma

```bash
docker compose up -d --build
```

Esto arranca:

- PostgreSQL
- backend API
- frontend
- Mailpit for local email inspection

## 4. Verificar el health del backend

```bash
curl -fsS http://localhost:3000/health
```

Estructura esperada:

```json
{
  "status": "ok",
  "services": {
    "database": "ok",
    "api": "ok"
  }
}
```

## 5. Abrir la aplicación

- frontend: `http://localhost:3001`
- backend: `http://localhost:3000`
- Mailpit: `http://localhost:8025`

## 6. Activar demo mode solo si hace falta

La configuración entregada no activa `DEMO_MODE` automáticamente.

Si quieres el dataset demo y los endpoints demo:

1. edit `.env`
2. set:

```env
DEMO_MODE=true
DEMO_PASSWORD=choose-a-demo-password
```

3. restart the stack:

```bash
docker compose up -d --build
```

Cuando está activo, el módulo demo puede sembrar usuarios, productos y pedidos de ejemplo, y los endpoints admin `/demo/seed` y `/demo/reset` pasan a ser operativos. `DEMO_PASSWORD` debe definirse explícitamente porque las credenciales demo ya no van hardcodeadas en backend.

## 7. Quality checks del backend

```bash
cd backend
npm run lint
npm run type-check
npm run test
npm run test:e2e
```

Para el gate local completo:

```bash
cd /path/to/repo
npm run test:ci
```

## 8. Notas sobre correo

- En Docker local normal, Mailpit está disponible para inspeccionar correo.
- En `test` y `E2E` de backend, Nodemailer usa `jsonTransport`, así que las pruebas no dependen de SMTP externo.
- Si quieres persistir un conector `SMTP` o `AWS SES` desde `ADMIN`, mantén `SYSTEM_SETTINGS_MASTER_KEY` estable entre reinicios del entorno.

## 9. Despliegue de producción

El despliegue de producción se gobierna desde [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) contra [`docker-compose.prod.yml`](../docker-compose.prod.yml).

El flujo de despliegue valida variables requeridas antes de escribir `.env`, mantiene secretos externalizados, usa permisos restrictivos y es seguro para ejecuciones repetidas sobre el mismo host.
