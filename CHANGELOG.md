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

### Fixed
- **API Security:** `PrismaClientExceptionFilter` endurecido para no exponer metadatos internos (P2002/P2025 mapeados a 409/404 genericos).
- **Validation:** Regex estricto para slugs en DTOs.
