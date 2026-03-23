# Demo Dataset And Catalog Spec

## Goal

Extract demo dataset inspection and catalog seeding from `DemoService` without
changing demo bootstrap behavior.

## Scope

This vertical owns:

- demo dataset status inspection
- demo dataset completeness and partial-data checks
- demo catalog creation and dependency validation
- static demo seed data constants

## Non-goals

- demo user bootstrap
- demo order scenario creation
- demo dataset cleanup
- demo bootstrap entrypoints

## Invariants

- demo users, products, city and categories remain unchanged
- demo dataset completeness thresholds remain unchanged
- demo catalog continues to use the same product payloads and image URLs
- `DemoService` wrappers remain callable by existing specs

## Acceptance criteria

- `DemoService` delegates dataset inspection and catalog creation
- static demo seed fixtures no longer bloat `DemoService`
- existing demo service specs continue to pass
- targeted dataset/catalog specs pass
