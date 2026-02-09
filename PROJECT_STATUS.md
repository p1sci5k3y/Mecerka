# PROJECT_STATUS.md

## 📅 Estado Actual
**Fase:** FASE 2 — DECISIONES FUNDAMENTALES (Validación Final)
**Última Actualización:** 2026-02-09

## 📌 1. Definición del Producto (Discovery Validado)
**Concepto:** Marketplace local multi-proveedor focalizado en el comercio de cercanía.
**Alcance MVP:**
- **Web App Responsive** (Móvil/Escritorio).
- **Regla de Oro Logística:** Un pedido = Una ciudad.
- **Roles:** Cliente, Proveedor.

## 🛡️ 2. Seguridad y Datos
- **Auth:** JWT (Stateless). Email + Password (Argon2/Bcrypt).
- **Datos Sensibles:** Mínimos (Email, Nombre).
- **Riesgos Críticos:** IDOR, XSS/SQLi.

## 🏗️ 3. Arquitectura (Modular Monolith)
- **Backend:** NestJS (Node.js) con arquitectura modular.
- **Frontend:** Next.js (comunicación directa a API).
- **Integración:** Docker Compose (sin API Gateway complejo para MVP).

## 🛠️ 4. Stack Tecnológico
- **Frontend:** Next.js + Tailwind CSS.
- **Backend:** NestJS + Prisma ORM.
- **Base de Datos:** PostgreSQL.
- **Infra/DevOps:** Docker, GitHub Actions (Lint/Test/Build).

## 🗂️ 5. Modelo de Datos Core
- Tablas Maestras: `City`, `Category`.
- Tablas Negocio: `User`, `Product`, `Order`, `OrderItem`.
