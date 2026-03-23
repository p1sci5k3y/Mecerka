# Delivery Incidents Atom Spec

## Goal

Extract delivery incident behavior from `DeliveryService` into a dedicated class without changing the public HTTP contract or observable behavior.

## Scope

This atom covers only:

- incident creation
- incident reads
- incident listing per delivery order
- incident lifecycle transitions

## Out of Scope

This atom does not change:

- delivery tracking
- delivery lifecycle transitions
- runner payment preparation
- delivery job dispatch
- controller routes or DTOs

## Public Contract

The following `DeliveryService` methods must keep their current signatures and behavior:

- `createIncident(dto, userId, roles)`
- `getIncident(incidentId, userId, roles)`
- `listDeliveryIncidents(deliveryOrderId, userId, roles)`
- `reviewIncident(incidentId, actorId)`
- `resolveIncident(incidentId, actorId)`
- `rejectIncident(incidentId, actorId)`

## Invariants

- incident evidence URLs remain restricted to HTTPS
- only an authorized actor can create an incident for a delivery order
- incident creation remains rate-limited:
  - max 10 incidents per reporter in a rolling 24h window
  - max 3 incidents per reporter per delivery order
- incident lifecycle transitions remain restricted to:
  - `OPEN -> UNDER_REVIEW`
  - `UNDER_REVIEW -> RESOLVED`
  - `UNDER_REVIEW -> REJECTED`
- resolved incidents cannot transition again
- incident reads remain restricted to:
  - admin
  - incident reporter
  - actors who are already allowed to participate in the delivery order
- risk events emitted after incident creation keep the current categories and scoring

## Design Constraints

- `DeliveryService` remains the application façade used by the controller
- incident logic moves to a dedicated class under `backend/src/delivery`
- no API payload shape changes
- no database schema changes
- no business feature changes

## Acceptance Criteria

- `DeliveryService` delegates the incidents vertical to a dedicated class
- existing incident tests keep passing
- a focused incident service spec covers the extracted behavior
- backend lint passes
- backend type-check passes
