# Changelog

Todos los cambios notables de este proyecto se documentarán en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/),
y este proyecto se adhiere a [Semantic Versioning](https://semver.org/lang/es/).

## [Unreleased]

### Fase 5: Bastionado de Seguridad & Dominio Zero-Trust (Nivel 5)

#### Añadido

- **Contexto Orientado a Dominio (DDD):**
  - Separación formal de `Order` (logística global) y `ProviderOrder` (agregación por tienda).
  - Implementación de máquina de estados puros con validaciones de invariantes estrictas para ambos modelos.
- **Consistencia Transaccional:**
  - Decrementos de stock atómicos mediante restricciones a nivel de base de datos.
  - Implementación de patrón Saga Lite (soporte para fallo parcial).
- **Resiliencia en Pagos y Webhooks:**
  - Verificación de webhook de Stripe con parseo adecuado del cuerpo en crudo (raw-body).
  - Idempotencia mediante restricciones de unicidad `paymentRef` para proteger contra re-entregas.
- **Seguridad Distribuida:**
  - Autorización en tiempo real: Verificación estricta de Handshake + inyección contextual en sockets.
  - Rotación de JWT "Zero-Downtime" de doble secreto mediante algoritmos de Fallback.
  - Inyección de `Helmet` para bastionado básico XSS/HTTP.
  - Plan de escalabilidad distribuido diseñado para mapas de WebSocket.
- **Separación de Privilegios:**
  - Mapeo estricto para acciones de Administración, previniendo manipulación de parámetros en `/users/roles/*`.
  - Decoradores avanzados de RBAC aplicados en toda la API.
  - Evaluaciones de propiedad mapeadas directamente contra la base de datos dentro de los escenarios de negocio.

### Fase 4: Tiempo Real (Infraestructura WebSocket) & Seguridad (Nivel 3/4)

#### Añadido

- **Revisión Completa de Autenticación:**
  - **Magic Links:** Eliminada la autenticación por contraseña en favor de enlaces mágicos por correo.
  - **Imposición de MFA:** Configuración obligatoria de 2FA/login OTP para todos los usuarios.
  - **Gestión de Roles:** Migración a sistema de roles basado en arrays (Client, Provider, Runner, Admin).
- **Funcionalidades del Proveedor:**
  - **Gestión de Inventario:** UI/UX completa para crear, editar y listar productos.
  - **Analítica de Ventas:**
    - Gráficos interactivos de comparación usando `recharts`.
    - Identificación del "Producto Estrella".
    - Historial de ventas detallado y métricas de ingresos.
  - **Seguridad:** Endpoint "Mis Productos" para garantizar el aislamiento de datos.

#### Cambiado

- **Navegación:** Enlaces de la barra de navegación (Navbar) adaptativos basados en el rol del usuario (ej., "Inventario" para Proveedores).
- **Refactorización:** Mejora de `OrdersService` y `ProductsService` para manejar lógica basada en roles.

#### Corregido

- **Registro:** Corregida lógica de validación para nuevos flujos de Proveedor/Runner.
- **MFA:** Resueltos problemas de verificación de OTP por discrepancia de versiones de `otplib`.
- **Docker:** Corregido comando de build de backend (`tsc -p tsconfig.build.json`) y nombres de servicio.
- **WebSocket:** Corregido namespace (`/tracking`) y problemas de CORS.
- **Enrutamiento:** Solucionados errores 404 de Next.js consolidando la estructura del directorio `app`.
- **Estabilidad:** Añadidas verificaciones de montado en cliente para componentes de Mapa para prevenir errores de hidratación SSR.

### Añadido

- Documentación inicial: README.md, PROJECT_STATUS.md, y estructura de gobierno.
- Definición de alcance y requisitos (Fase de Exploración/Discovery).
- **Slice 1 (Base de Datos):** Modelos Prisma (User, City, Category, Product, Order) y migración inicial.
- **Slice 2 (API de Datos Maestros):** Endpoints CRUD para Ciudades y Categorías.
  - DTOs con validación estricta (class-validator).
  - Script de inicialización (Seed) para datos de prueba.
- **Slice 3 (Auth):** Sistema de Identidad completo (Registro, Login, JWT, RBAC).
- **Slice 4 (Productos):** Gestión de catálogo para proveedores con reglas de propiedad y pertenencia.
- **Slice 5 (Pedidos):** Sistema transaccional completo de pedidos.
  - Validación de stock y agrupación por ciudad.
  - Instantánea de precios (`priceAtPurchase`).
  - Lógica atómica con `prisma.$transaction`.
- **Slice F1 (Frontend):** Arquitectura base Next.js App Router.
  - AuthProvider (Contexto, Almacenamiento en Memoria).
  - Wrapper `apiFetch` para peticiones autenticadas.
  - Rutas protegidas y públicas separadas por Layouts.
- **Slice F2 (Integración Auth):** UI de Autenticación conectada.
  - Formularios Login/Register con manejo de errores y tipos estrictos.
  - Redirección y protección de rutas en `layout.tsx`.
  - Dashboard reactivo al Rol del usuario.
- **Slice F3 (Catálogo de Productos):** Visualización pública de productos.
  - Servicios tipados (`getProducts`, `getProductById`).
  - Componentes `ProductCard` y Grid Layout.
  - Estado Load/Error/Empty manejado.
  - Botón "Editar" visible solo para el proveedor dueño.
- **Slice F4 (Carrito de Compras):** Gestión de carrito de cliente.
  - `CartContext` con persistencia en memoria.
  - Validación estricta: todos los productos deben ser de la misma ciudad.
  - UI: Contador en Navbar, página `/cart` con gestión de cantidades y eliminación.
- **Slice F5 (Checkout):** Integración del proceso de pago con Backend.
  - Servicio `ordersService.createOrder` interactivo y transaccional.
  - Botón "Proceder al Pago" correctamente conectado.
  - Manejo de flujo: Chequeo de Auth -> Crear Pedido -> Limpiar Carrito -> Redirigir al Dashboard.
- **Slice F6 (Dashboard de Cliente):** Analítica básica y pedidos.
  - Tabla de pedidos en `/dashboard` (ID, Fecha, Ciudad, Estado, Total).
  - Integración segura inter-rol vía `GET /orders`.
  - Estados de carga y error manejados.
- **Slice F7 (Ventas del Proveedor):** Tablero de Ventas.
  - Backend: `OrdersService.findAll` soporta filtrado dinámico por Rol.
    - Clientes ven sus pedidos.
    - Proveedores ven pedidos que contienen sus productos (aislamiento riguroso).
  - Frontend: Nueva ruta `/provider/sales` protegida.
  - Tabla de ventas con desglose de ítems (Producto, Cantidad, Precio Único, Rendimiento).
  - Logística de Navbar condicional al estatus `Sales`.
- **Slice F8 (Integración Frontend V2):** Ingesta del motor V2 de Next.js (Visual Engine).
  - Implementación de Patrón Adaptador en servicios (`products-service`, `orders-service`) para transformar Data Contracts del backend a formatos consumibles por UI.
  - Auditoría general de control de vista: JWT restringido.

### Fase 3: Gobernanza, Administración & Comunicación (Nivel 3)

#### Añadido

- **Backend (Módulo Administrador):**
  - **Roles y Seguridad:** Se añadió el rol `ADMIN`, inicialización segura (`admin@meceka.local`), y guardia global `RolesGuard`.
  - **Gestión de Usuarios:** Endpoints para listar, bloquear y promocionar usuarios (`PATCH`). Prevenido modificar super-administradores.
  - **Datos Maestros:** Trazabilidad CRUD completa para Ciudades y Categorías usando anotaciones DTO exigentes.
  - **Métricas:** Cálculos analíticos delegados al motor de base de datos (`count`, `sum`) para escalabilidad.
- **Sistema de Correos (SMTP Local):**
  - **Integración de Mailpit:** Servicio pasivo lanzado dentro del ciclo de vida en los puertos 1025/8025 de Docker.
  - **Disparadores Asíncronos:** Recepción/Bienvenida (Registration), Inyección One-Time (Código MFA), Resiliencia (Restablecimiento).
  - **Disponibilidad:** Sistema delegativo `nodemailer` inyectado para previsiones sin cuello de botella en los main threads HTTP.
- **Frontend (Panel de Administrador):**
  - **Rutas Protegidas:** Mapeos de `/admin/*` inyectados y rediseños directos ante faltas de autorización hacia página principal.
  - **UI/UX Moderno:** Vista lateral, recuentos e informes tabulados, control profesional responsive a cualquier pantalla gráfica.
  - **Herramientas de Gestión:**
    - **Usuarios:** Etiquetas de estado dinámicas (Activo/Bloqueado) y conmutación de roles directa.
    - **Maestros:** Interfaz de pestañas amigable listada para Ciudades y su encaje relacional con Categorías.
- **Gobernanza Técnica (Automatizados & Flujos CI/CD):**
  - Optimizaciones de inicialización de `mailpit` sobre el CLI de `docker-compose`.
  - Pruebas Linter puras integradas sin emisión ni transpilaciones huérfanas.

#### Corregido

- **Archivos Fantasmas:** Erradicadas las referencias muertas generadas al cambiar los servicios principales `frontend/services/orders.ts`.
- **Linting:** Migrado a configuración estándar base y forzadas optimizaciones en validadores como `useEffect` dep rules o advertencias de hidratación de imágenes HTML/Next.
- **Dependencias Puras:** Intersecciones de compatibilidad estabilizadas con dependencias `peerDependencies` sobre manipuladores estrictos (ej. librerías fecha).
- **Seguridad de Interfaz API:** Envoltorio `PrismaClientExceptionFilter` blindado con excepciones contextuales limpias e hidrogenadas. Impidió escapes SQL directos hacia los visores JSON al invocar objetos fantasma (P2025 null references/P2002 duplicates).
- **Validación Limpia Regex y Contexto:** Generación robusta de `Slugs` en nombres, depurando peticiones REST a nivel middleware antes de golpear el RDBMS.
