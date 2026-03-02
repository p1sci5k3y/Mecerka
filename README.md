# 🏙️ Mecerka - Local Marketplace Platform

## 📖 ¿Qué es Mecerka?

**Mecerka** es una plataforma tipo _marketplace_ diseñada específicamente para revitalizar el **Comercio de Cercanía**. Permite a los pequeños negocios locales de una misma ciudad unirse en un escaparate digital común, donde los clientes pueden realizar compras simultáneas a múltiples tiendas y unificar la logística de entrega en un solo viaje ("última milla" unificada).

Este proyecto nace como un **Trabajo de Fin de Máster (TFM)** desarrollado bajo estrictos criterios de ingeniería de software corporativo. No es simplemente un CRUD; hace hincapié en la calidad arquitectónica (Domain-Driven Design), la seguridad (Zero Trust, RBAC, JWT Fallback) y la robustez transaccional (Idempotencia, Máquina de Estados Pura) sobre el mero apilamiento de funcionalidades estéticas.

---

## 🏗️ Arquitectura y Tecnologías

El sistema está dividido en dos partes principales (Monorepo):

- **Backend (NestJS):** Monolito modular basado en arquitectura hexagonal y Domain-Driven Design (DDD).
  - **Base de datos:** Prisma ORM (+ SQLite para MVP).
  - **Tiempo Real:** WebSockets (Socket.io) autorizados por token para seguimiento logístico.
  - **Eventos:** `@nestjs/event-emitter` para el desacoplamiento interno (Domain Events).
  - **Pagos:** Integración con webhook de Stripe (verificación de firmas y Body crudo).
- **Frontend (Next.js 14):** Aplicación re-utilizable con SSR y React Server Components.
  - Componentes UI modernos (v0.dev / Shadcn UI).
  - Contextos de Carrito y Autenticación fuertemente tipados.
- **Entorno Local:** `Docker Compose` orquestando servicios complementarios (Mailpit) y aislando el entorno de pruebas.

---

## 🚀 Guía de Instalación y Arranque

### Requisitos Previos

- Node.js (v20 o superior recomendado).
- Docker y Docker Compose (para el servidor de correo falso en local `Mailpit`).

### 1. Levantar Servicios Docker

Para interceptar los correos electrónicos simulados (Registro, MFA, etc.):

```bash
docker-compose up -d
```

El buzón estará disponible en http://localhost:8025.

### 2. Configurar el Backend

```bash
cd backend
npm install
```

El archivo de entorno (`.env`) ya debería venir precargado con secretos genéricos en este repositorio de MVP, pero asegúrate de que existen variables clave como `JWT_SECRET`, `JWT_SECRET_CURRENT` y `DATABASE_URL="file:./dev.db"`.

Inicializa y carga datos base en la BD:

```bash
npx prisma migrate dev
npx prisma db seed
npm run start:dev
```

El backend estará escuchando en http://localhost:3000.

### 3. Configurar el Frontend

```bash
cd frontend
npm install
npm run dev
```

La aplicación web consumidora estará disponible en http://localhost:3001.

---

## 🎯 Ejemplos de Flujos para Probar

Al arrancar con `db seed`, tendrás un entorno listo para operar. Recomendamos seguir este flujo para entender el núcleo de _Mecerka_:

1. **Catálogo y Carrito:** Accede como un usuario cliente, explora la ciudad y añade productos de distintas tiendas al carrito.
2. **Checkout Lógico:** Observa cómo el sistema bloquea productos de ciudades cruzadas.
3. **Flujo Cero-Tolerancia:** Completa el pedido simulando la pasarela; el backend restará stock de forma atómica.
4. **Vistas de Rol:** Inicia sesión como `provider@mecerka.local` y observa cómo el Dashboard muta para mostrar métricas analíticas y tus productos, ocultando el ruido de otras tiendas.

---

## 🚧 Estado del Proyecto

Consultar [PROJECT_STATUS.md](./PROJECT_STATUS.md) para ver la fase actual, decisiones técnicas vigentes y deuda técnica asumida (ADRs).

## 📋 Changelog

Todas las versiones, correcciones de errores y decisiones arquitectónicas (ej. _Phase 5: Security Hardening_) se registran estrictamente en [CHANGELOG.md](./CHANGELOG.md).

---

## 🛡️ Gobernanza & QA

Para garantizar la calidad académica y técnica, este repositorio utiliza **Husky** y **lint-staged**:

- **Pre-commit:** Se ejecutan `eslint` y `tsc --noEmit` automáticamente en los archivos modificados (Frontend y Backend). El commit fallará si el tipado o sintaxis están rotos.
- **Unit Testing:** Ejecutable vía `npm run test` (Cubre Dominio, Casos de Integración y API).
- **CI (GitHub Actions):** Bloquea integraciones si fallan Lint, Build o Tests en un entorno limpio.

---

# Licencia Mecerka

Copyright (c) 2026 p1sci5k3y.

Se concede permiso, de forma gratuita, a cualquier persona que obtenga una copia de este software y los archivos de documentación asociados, para utilizar el Software sin restricción, incluyendo sin limitación los derechos para usar, copiar, modificar, fusionar, publicar y distribuir el Software, siempre que sea para fines no comerciales. Queda prohibida la venta, licencia o uso del Software para obtener beneficios económicos directos o indirectos. EL SOFTWARE SE PROPORCIONA "TAL CUAL", SIN GARANTÍA DE NINGÚN TIPO.
