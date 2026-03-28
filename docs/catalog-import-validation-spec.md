# Catalog Import Validation Spec

## Objetivo

Extract catalog row normalization and validation from `CatalogImportService`
into a dedicated service without changing the import-job API.

## Alcance

This vertical owns:

- category resolution for uploaded rows
- duplicate reference detection inside a file
- field parsing for price, optional discount price, stock, and image URL
- spreadsheet formula-injection checks
- normalized row construction for valid records

## No objetivos

- provider/job lookup
- import job persistence
- transactional application of validated rows
- CSV export/template generation

## Invariantes

- invalid rows generate structured validation errors
- only rows without errors become normalized rows
- discount price must remain lower than price
- image URLs must be valid http/https URLs
- cells starting with spreadsheet formula characters are rejected

## Criterios de aceptación

- `CatalogImportService` delegates row normalization to a dedicated service
- `validateImport()` response shape remains unchanged
- targeted validation specs pass
- existing `CatalogImportService` specs continue to pass
