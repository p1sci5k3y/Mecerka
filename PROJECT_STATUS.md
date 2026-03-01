# Estado del Proyecto (Project Status)

## Progreso General

- **Fase 1 (MVP)**: Finalizada ✅
- **Fase 2 (Autenticación y Frontend Base)**: Finalizada ✅
- **Fase 3 (Gobernanza, Administración y Comunicación)**: Finalizada ✅
- **Fase 4 (Tiempo Real & Seguridad Funcional)**: Finalizada ✅
- **Fase 5 (Dominio Zero-Trust & Bastionado Avanzado)**: Finalizada ✅

## Hitos Completados (Milestones)

### Fase 1: Base de Datos y API

- [x] Modelado de base de datos (Prisma Schema).
- [x] API CRUD para Cities y Categories.
- [x] Seed inicial de datos.

### Fase 2: Autenticación y Frontend Base

- [x] Sistema de Registro y Login (JWT).
- [x] Protección de rutas (Guards/Middleware).
- [x] Frontend base con Next.js y Tailwind.
- [x] Catálogo de productos público.
- [x] Carrito de compras funcional (Local Storage).
- [x] Checkout básico (Creación de pedidos).

### Fase 3: Gobernanza, Administración y Comunicación

- [x] **Rol ADMIN**: Implementado en DB y Auth Guards.
- [x] **Panel de Admin**: Dashboard, Gestión de Usuarios, ABM de Ciudades/Categorías.
- [x] **Email System**: Integración con Mailpit (SMTP Local) y envíos asíncronos.
- [x] **MFA**: Activación de doble factor (TOTP) con QR.
- [x] **Docker**: Optimización de contenedores y orquestación con Mailpit.
- [x] **Calidad**: Linter (ESLint v8) y Build checks pasados sin errores.

### Fase 4: Tiempo Real & Seguridad Funcional

- [x] **Autenticación "Passwordless"**: Migración a enlaces mágicos / OTP.
- [x] **MFA Mandatorio**: Imposición de factores de autenticación en perfiles.
- [x] **WebSockets (Runners)**: Tracking en tiempo real autenticado.
- [x] **Módulo Proveedor Avanzado**: Analítica interactiva y aislamiento lógico de productos.

### Fase 5: Dominio Zero-Trust & Bastionado Avanzado

- [x] **Dominio y Saga Lite**: Separación arquitectónica estricta (Order vs ProviderOrder) con decrecimiento atómico en BD.
- [x] **Webhook Idempotente**: Resiliencia pasarela de pagos vía bloqueos de `paymentRef`.
- [x] **Seguridad Contextual**: Inyección transparente de JWT Socket.io y rotación _Zero-Downtime_ de dobles secretos.
- [x] **Bastionado de Red**: Aplicados parámetros NIS2 (Helmet, CORS, Headers).
- [x] **Privilegios API**: Decoradores RBAC granulares y defensas contra escaladas de IDOR.

## Próximos Pasos (Deploy & Producto)

- Puesta en producción (Vercel / Railway).
- Revisión de UX Final para proveedores.
- Pruebas E2E de simulación de flota con múltiples ventanas.
