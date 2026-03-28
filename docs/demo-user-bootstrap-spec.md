# Demo User Bootstrap Spec

## Objetivo

Extract demo user bootstrap concerns from `DemoService` into a dedicated
service without changing demo seed behavior.

## Alcance

This vertical owns:

- demo admin lookup/creation
- demo user lookup by email
- demo password resolution from config
- registration and email verification of demo users
- role shaping for demo users
- bootstrap of demo Stripe account identifiers and provider coordinates

## No objetivos

- demo dataset status checks
- demo catalog creation
- demo order scenario creation
- demo dataset cleanup
- demo bootstrap orchestration

## Invariantes

- demo users keep the same emails and role shape
- `DEMO_PASSWORD` remains mandatory when demo mode needs registration
- provider and runner Stripe account bootstrap values remain unchanged
- `DemoService` private wrappers remain callable by existing specs

## Criterios de aceptación

- `DemoService` delegates user bootstrap concerns
- existing demo service specs continue to pass
- targeted bootstrap specs pass
