import type { OrderTrackingSnapshot } from "@/lib/types"

export function getTrackingSignalState(
  updatedAt: string | null,
  nowMs = Date.now(),
): "recent" | "stale" | "missing" {
  if (!updatedAt) return "missing"

  const updatedMs = new Date(updatedAt).getTime()
  if (Number.isNaN(updatedMs)) return "missing"

  const ageMinutes = (nowMs - updatedMs) / (1000 * 60)
  return ageMinutes <= 10 ? "recent" : "stale"
}

export function getTrackingSignalLabel(updatedAt: string | null, nowMs = Date.now()) {
  switch (getTrackingSignalState(updatedAt, nowMs)) {
    case "recent":
      return "Señal reciente"
    case "stale":
      return "Señal desactualizada"
    default:
      return "Sin señal"
  }
}

export function getPickupCoverageLabel(deliveryStatus?: string | null, stopCount = 0) {
  switch (deliveryStatus) {
    case "RUNNER_ASSIGNED":
      return "Runner asignado"
    case "PICKUP_PENDING":
      return stopCount > 1 ? "Recogidas coordinándose" : "Recogida pendiente"
    case "PICKED_UP":
      return "Recogida completada"
    case "IN_TRANSIT":
      return "Recogidas completadas"
    case "DELIVERED":
      return "Entrega cerrada"
    case "CANCELLED":
      return "Flujo cancelado"
    default:
      return "Sin contexto"
  }
}

export function getRunnerAssignmentLabel(tracking: OrderTrackingSnapshot | null) {
  return tracking?.runner?.name ? `Asignado a ${tracking.runner.name}` : "Runner pendiente"
}
