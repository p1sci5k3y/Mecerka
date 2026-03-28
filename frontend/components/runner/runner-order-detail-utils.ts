import type { DeliveryIncidentSummary, ProviderOrder } from "@/lib/types"

export function formatCurrency(amount: number) {
  return amount.toLocaleString("es-ES", {
    style: "currency",
    currency: "EUR",
  })
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

export function runnerPaymentLabel(status?: string | null) {
  switch (status) {
    case "PAID":
      return "Cobrado"
    case "PAYMENT_READY":
      return "Sesión lista"
    case "PAYMENT_PENDING":
    case "PENDING":
      return "Pago pendiente"
    case "FAILED":
      return "Pago fallido"
    default:
      return "Sin estado"
  }
}

export function pickupStatusLabel(status: ProviderOrder["status"]) {
  switch (status) {
    case "READY_FOR_PICKUP":
      return "Listo para recoger"
    case "PICKED_UP":
      return "Recogido"
    case "PREPARING":
    case "ACCEPTED":
    case "PENDING":
      return "En preparación"
    case "DELIVERED":
      return "Entregado"
    default:
      return status
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

export function shouldShowRouteMap(status?: string | null) {
  return (
    status === "RUNNER_ASSIGNED" ||
    status === "PICKUP_PENDING" ||
    status === "PICKED_UP" ||
    status === "IN_TRANSIT" ||
    status === "DELIVERED"
  )
}
