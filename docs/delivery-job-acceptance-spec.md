# Delivery Job Acceptance Spec

## Objetivo

Extract delivery-job acceptance from `DeliveryDispatchService` into a dedicated
service without changing the observable dispatch API.

## Alcance

This vertical owns:

- delivery job row locking during acceptance
- claim deduplication per runner and job
- expiry enforcement during acceptance
- runner eligibility and payment-onboarding checks
- assignment of runner to the delivery order and root order
- post-acceptance job-grabbing risk emission

## No objetivos

- manual runner assignment by client/admin
- job listing
- job creation
- job expiry worker

## Invariantes

- only open, non-expired jobs can be accepted
- a runner can only claim a given job once
- runner must be active and payment-onboarded
- delivery order and root order stay aligned on assigned runner
- job-grabbing risk signal remains emitted on the same threshold/window rules

## Criterios de aceptación

- `DeliveryDispatchService` delegates `acceptDeliveryJob()`
- observable result shape and conflicts remain unchanged
- targeted acceptance specs pass
- existing dispatch specs continue to pass
