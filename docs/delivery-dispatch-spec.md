# Delivery Dispatch Atom Spec

## Objetivo

Extract delivery job publication and assignment from `DeliveryService` into a dedicated class without changing the public HTTP contract or observable behavior.

## Alcance

This atom covers only:

- delivery job creation
- delivery job listing
- delivery job acceptance
- job expiration
- runner assignment through the delivery job flow

## Fuera de alcance

This atom does not change:

- delivery lifecycle transitions
- delivery tracking
- delivery incidents
- runner payment preparation
- delivery order reads
- controller routes or DTOs

## Contrato público

The following `DeliveryService` methods must keep their current signatures and behavior:

- `createDeliveryJob(deliveryOrderId)`
- `assignRunner(deliveryOrderId, dto, userId, roles)`
- `listAvailableJobs(runnerId?)`
- `acceptDeliveryJob(jobId, runnerId)`
- `expireDeliveryJobs(now?)`

## Invariantes

- only the client owner or an admin can assign a runner directly
- only eligible delivery orders can be assigned
- runners must be active and payment-onboarded before assignment
- job listing only returns open, non-expired jobs
- accepting a job remains transactional and single-winner
- expired jobs are marked as expired before rejecting acceptance
- rapid job grabbing continues to emit the same runner risk event

## Restricciones de diseño

- `DeliveryService` remains the application façade used by the controller
- dispatch logic moves to a dedicated class under `backend/src/delivery`
- no API payload shape changes
- no database schema changes
- no business feature changes

## Criterios de aceptación

- `DeliveryService` delegates dispatch and assignment to a dedicated class
- existing job and assignment tests keep passing
- a focused dispatch service spec covers the extracted behavior
- backend lint passes
- backend type-check passes
