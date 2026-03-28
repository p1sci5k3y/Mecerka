# Delivery Lifecycle Atom Spec

## Objetivo

Extract delivery lifecycle transitions from `DeliveryService` into a dedicated class without changing the public HTTP contract or observable behavior.

## Alcance

This atom covers only:

- transition to `PICKUP_PENDING`
- transition to `PICKED_UP`
- transition to `IN_TRANSIT`
- transition to `DELIVERED`

## Fuera de alcance

This atom does not change:

- delivery tracking
- delivery incidents
- runner payment preparation
- delivery job dispatch
- controller routes or DTOs

## Contrato público

The following `DeliveryService` methods must keep their current signatures and behavior:

- `markPickupPending(deliveryOrderId, userId, roles)`
- `confirmPickup(deliveryOrderId, userId, roles)`
- `startTransit(deliveryOrderId, userId, roles)`
- `confirmDelivery(deliveryOrderId, userId, roles, dto?)`

## Invariantes

- only the assigned runner or an admin can update delivery lifecycle
- lifecycle transitions remain restricted to the current allowed state machine
- repeated transitions to the same target state remain idempotent
- `pickupAt`, `transitAt` and `deliveredAt` are set only once
- delivery proof URL and delivery notes are only persisted on `DELIVERED`
- lifecycle transitions continue emitting the same structured log event

## Restricciones de diseño

- `DeliveryService` remains the application façade used by the controller
- lifecycle logic moves to a dedicated class under `backend/src/delivery`
- no API payload shape changes
- no database schema changes
- no business feature changes

## Criterios de aceptación

- `DeliveryService` delegates lifecycle transitions to a dedicated class
- existing lifecycle tests keep passing
- a focused lifecycle service spec covers the extracted behavior
- backend lint passes
- backend type-check passes
