# TFM - Marketplace Local Multi-Proveedor

## 📖 Descripción del Proyecto
Plataforma tipo marketplace diseñada para revitalizar el comercio local ("Comercio de Cercanía"). Permite a los negocios de una ciudad publicar productos y a los clientes realizar pedidos unificados por ciudad, optimizando la carga logística simulada.

Este proyecto es un Trabajo de Fin de Máster (TFM) desarrollado bajo estrictos criterios de ingeniería de software, priorizando la calidad arquitectónica, la seguridad y la trazabilidad sobre la cantidad de funcionalidades.

## 🎯 Objetivos del MVP
1.  **Conexión Local:** Facilitar la venta online a pequeños comercios sin infraestructura propia.
2.  **Experiencia Unificada:** Permitir al cliente comprar a múltiples proveedores de su ciudad en un solo flujo.
3.  **Solidez Técnica:** Demostrar una arquitectura escalable, segura y mantenible.

## 🚀 Funcionalidades Clave
- **Catálogo Multi-Proveedor:** Búsqueda y filtrado de productos.
- **Carrito Inteligente:** Validación de lógica de negocio (regla de "misma ciudad").
- **Gestión de Pedidos:** Flujos diferenciados para Clientes y Proveedores.
- **Seguridad desde el Diseño:** Protección contra IDOR y vulnerabilidades comunes (OWASP).

## 🚧 Estado del Proyecto
Consultar [PROJECT_STATUS.md](./PROJECT_STATUS.md) para ver la fase actual y las decisiones técnicas vigentes.

## 📋 Changelog
Todas las versiones y cambios se registran estrictamente en [CHANGELOG.md](./CHANGELOG.md).

## 🛡️ Gobernanza & QA
Para garantizar la calidad académica y técnica, este repositorio utiliza **Husky** y **lint-staged**:
- **Pre-commit:** Se ejecutan `lint` y `type-check` automáticamente en los archivos modificados (Frontend y Backend). commit fallará si existen errores.
- **Pre-push:** (Opcional) Ejecución de tests unitarios antes de subir a remoto.
- **CI (GitHub Actions):** Bloquea merge si fallan Lint, Build o Tests en un entorno limpio.

# Mecerka
