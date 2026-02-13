# Estado del Proyecto (Project Status)

## Progreso General
- **Fase 1 (MVP)**: Finalizada ✅
- **Fase 2 (Autenticación y Productos)**: Finalizada ✅
- **Fase 3 (Gobernanza y Administración)**: Finalizada ✅
- **Fase 4 (Reglas de Negocio)**: Pendiente ⏳

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

## Próximos Pasos (Fase 4)
- Implementar lógica compleja de marketplace (comisiones, pagos divididos).
- Refinar roles de Proveedor (panel de ventas detallado).
- Integración con pasarela de pagos (Stripe/PayPal mock).
