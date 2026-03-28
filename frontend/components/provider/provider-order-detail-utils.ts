import type { DeliveryIncidentSummary, Order, ProviderOrder } from "@/lib/types"

export function formatCurrency(amount: number) {
  return amount.toLocaleString("es-ES", {
    style: "currency",
    currency: "EUR",
  })
}

export function providerStatusLabel(status: ProviderOrder["status"]) {
  switch (status) {
    case "PENDING":
      return "Pendiente"
    case "ACCEPTED":
      return "Aceptado"
    case "PREPARING":
      return "Preparando"
    case "READY_FOR_PICKUP":
      return "Listo para recogida"
    case "PICKED_UP":
      return "Recogido"
    case "DELIVERED":
      return "Entregado"
    case "CANCELLED":
      return "Cancelado"
    case "REJECTED_BY_STORE":
      return "Rechazado por comercio"
    default:
      return "Sin estado"
  }
}

export function paymentStatusLabel(status?: string) {
  switch (status) {
    case "PAID":
      return "Cobrado"
    case "PAYMENT_READY":
      return "Sesión lista"
    case "PAYMENT_PENDING":
      return "Pago pendiente"
    case "FAILED":
      return "Pago fallido"
    default:
      return "Sin estado"
  }
}

export function orderStatusLabel(status: Order["status"]) {
  switch (status) {
    case "PENDING":
      return "Pendiente"
    case "CONFIRMED":
      return "Confirmado"
    case "READY_FOR_ASSIGNMENT":
      return "Listo para asignación"
    case "ASSIGNED":
      return "Repartidor asignado"
    case "IN_TRANSIT":
      return "En reparto"
    case "DELIVERED":
      return "Entregado"
    case "CANCELLED":
      return "Cancelado"
    default:
      return "Sin estado"
  }
}

export function deliveryStatusLabel(status?: string | null) {
  switch (status) {
    case "ASSIGNED":
      return "Asignado"
    case "IN_TRANSIT":
      return "En reparto"
    case "DELIVERED":
      return "Entregado"
    case "CANCELLED":
      return "Cancelado"
    default:
      return "Sin estado"
  }
}

export function refundStatusLabel(status: string) {
  switch (status) {
    case "REQUESTED":
      return "Solicitada"
    case "UNDER_REVIEW":
      return "En revisión"
    case "APPROVED":
      return "Aprobada"
    case "REJECTED":
      return "Rechazada"
    case "EXECUTING":
      return "Ejecutando"
    case "COMPLETED":
      return "Completada"
    case "FAILED":
      return "Fallida"
    default:
      return "Sin estado"
  }
}

export function incidentStatusLabel(status: DeliveryIncidentSummary["status"]) {
  switch (status) {
    case "OPEN":
      return "Abierta"
    case "UNDER_REVIEW":
      return "En revisión"
    case "RESOLVED":
      return "Resuelta"
    case "REJECTED":
      return "Rechazada"
    default:
      return "Sin estado"
  }
}
