# Delivery Order Creation Spec

## Objetivo

Extract delivery-order creation from `DeliveryService` into a dedicated service
without changing the observable behavior of the delivery API.

## Alcance

This vertical owns:

- order locking before delivery creation
- client/admin access enforcement for delivery creation
- duplicate delivery-order detection
- official delivery-fee validation
- delivery-order persistence
- initial dispatch-job creation

## No objetivos

- delivery tracking
- incidents
- runner payment
- lifecycle transitions
- delivery order read access

## Invariantes

- only the order client or an admin can create a delivery order
- delivery fee must match the order delivery fee
- only one delivery order can exist per order
- initial dispatch job is created inside the same transaction

## Criterios de aceptación

- `DeliveryService` delegates `createDeliveryOrder()`
- response payload and errors remain unchanged
- targeted creation specs pass
- existing delivery service specs continue to pass
