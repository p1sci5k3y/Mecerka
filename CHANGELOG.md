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

### Fixed
- **API Security:** `PrismaClientExceptionFilter` endurecido para no exponer metadatos internos (P2002/P2025 mapeados a 409/404 genericos).
- **Validation:** Regex estricto para slugs en DTOs.
