# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Added
- Documentación inicial: README.md, PROJECT_STATUS.md, y estructura de gobierno.
- Definición de alcance y requisitos (Discovery Phase).
- **Slice 1 (Database):** Modelos Prisma (User, City, Category, Product, Order) y migración inicial.
- **Slice 2 (Master Data API):** Endpoints CRUD para Cities y Categories.
  - DTOs con validación estricta (class-validator).
  - Seed script para datos iniciales.
- **Slice 3 (Auth):** Sistema de Identidad completo (Register, Login, JWT, RBAC).
- **Slice 4 (Products):** Gestión de catálogo para proveedores con reglas de propiedad.
- **Slice 5 (Orders):** Sistema transaccional de pedidos.
  - Validación de stock y agrupación por ciudad.
  - Snapshot de precios (`priceAtPurchase`).
  - Lógica atómica con `prisma.$transaction`.
- **Slice F1 (Frontend):** Arquitectura base Next.js App Router.
  - AuthProvider (Context, Memory Storage).
  - Wrapper `apiFetch` para peticiones autenticadas.
  - Rutas protegidas y públicas separadas por Layouts.
- **Slice F2 (Auth Integration):** UI de Autenticación conectada.
  - Formularios Login/Register con manejo de errores y tipos estrictos.
  - Redirección y protección de rutas en `layout.tsx`.
  - Dashboard reactivo al Rol del usuario.
- **Slice F3 (Product Catalog):** Visualización pública de productos.
  - Servicios tipados (`getProducts`, `getProductById`).
  - Componentes `ProductCard` y Grid Layout.
  - Estado Load/Error/Empty manejado.
  - Botón "Edit" visible solo para el proveedor dueño.
- **Slice F4 (Shopping Cart):** Gestión de carrito en cliente.
  - `CartContext` con persistencia en memoria.
  - Validación estricta: todos los productos deben ser de la misma ciudad.
  - UI: Contador en Navbar, página `/cart` con gestión de cantidades y eliminación.
- **Slice F5 (Checkout):** Integración con Backend.
  - Servicio `ordersService.createOrder` implementado.
  - Botón "Proceed to Checkout" conectado.
  - Manejo de flujo: Auth Check -> Create Order -> Clear Cart -> Redirect Dashboard.
- **Slice F6 (Client Dashboard):** Historial de Pedidos.
  - Tabla de pedidos en `/dashboard` (ID, Fecha, Ciudad, Estado, Total).
  - Integración con `GET /orders`.
  - Estados de carga y error manejados.
- **Slice F7 (Provider Sales):** Tablero de Ventas.
  - Backend: `OrdersService.findAll` soporta filtrado por Rol.
    - Clientes ven sus pedidos.
    - Proveedores ven pedidos que contienen sus productos (aislamiento de datos).
  - Frontend: Nueva ruta `/provider/sales` protegida.
  - Tabla de ventas con desglose de items (Producto, Cantidad, Precio Unitario, Total).
  - Navbar condicional para enlace "Sales".
- **Slice F7 (Frontend V2 Integration):** Integración de nueva UI (v0/Lovable).
  - Implementación de Adapter Pattern en servicios (`products-service`, `orders-service`) para transformar Data Contracts del backend a UI.
  - Auditoría de Seguridad: JWT restringido a memoria (AuthContext), protección de rutas por roles.
  - Features Mockeadas: UX de MFA (Profile setup) y Panel de Admin (preview data).
  - Verificación de Build e Integración de API Real.

### Phase 3: Governance, Administration & Communication (Nivel 3)
#### Added
- **Backend (Admin Module):**
  - **Role & Security:** Added `ADMIN` role, secure seeding (`admin@meceka.local`), and global `RolesGuard`.
  - **User Management:** Endpoints for listing, blocking, and promoting users (`PATCH`). Prevented self-modification.
  - **Master Data:** Full CRUD for Cities and Categories with strict DTO validation.
  - **Metrics:** Database-aggregated stats (`count`, `sum`) for Users, Orders, Clients, and Revenue.
- **Email System (Local SMTP):**
  - **Mailpit Integration:** Docker service running on ports 1025/8025.
  - **Async Triggers:** Welcome email (Registration), MFA Code (Activation), and Mock Password Reset.
  - **Availability:** Non-blocking email sending using `nodemailer`.
- **Frontend (Admin Panel):**
  - **Protected Routes:** `/admin/*` restricted to admins with auto-redirect.
  - **Modern UI/UX:** Professional sidebar layout, metric cards dashboard, and responsive tables.
  - **Management Tools:** 
    - **Users:** Status badges (Active/Blocked) and role switching actions.
    - **Masters:** Tabbed interface for managing Cities and Categories.
- **Technical Governance:** 
  - Optimized Docker setup with `mailpit`.
  - Passed strict build/lint checks (Frontend/Backend).

### Fixed
- **Phantom Files:** Resolved IDE errors caused by stale `frontend/services/orders.ts` (removed).
- **Linting:** Downgraded ESLint to v8 for stability and resolved all warnings (`useEffect` deps, `next/image`).
- **Dependencies:** Fixed `otplib` import issues and `date-fns` peer conflicts.
- **API Security:** `PrismaClientExceptionFilter` hardened (generic errors for P2002/P2025).
- **Validation:** Strict Regex for slugs in DTOs.
