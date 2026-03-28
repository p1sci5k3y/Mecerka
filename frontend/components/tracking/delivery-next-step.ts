import type { OrderTrackingSnapshot } from "@/lib/types"

type DeliveryNextStepInput = {
  orderStatus?: string | null
  deliveryStatus?: string | null
  tracking: OrderTrackingSnapshot | null
  openSupportCount: number
}

export type DeliveryNextStepSummary = {
  title: string
  description: string
  tone: "info" | "warning" | "success"
}

function hasRecentSignal(updatedAt: string | null) {
  if (!updatedAt) return false

  const updatedMs = new Date(updatedAt).getTime()
  if (Number.isNaN(updatedMs)) return false

  return Date.now() - updatedMs <= 10 * 60 * 1000
}

export function getDeliveryNextStepSummary({
  orderStatus,
  deliveryStatus,
  tracking,
  openSupportCount,
}: DeliveryNextStepInput): DeliveryNextStepSummary {
  if (openSupportCount > 0) {
    return {
      title: "Revisar soporte operativo",
      description:
        "Hay casos abiertos que pueden afectar al cierre del reparto. Conviene seguir el soporte además del mapa.",
      tone: "warning",
    }
  }

  if (deliveryStatus === "DELIVERED" || orderStatus === "DELIVERED") {
    return {
      title: "Entrega completada",
      description:
        "El pedido ya llegó a destino. El siguiente paso es confirmar que todo quedó correctamente cerrado.",
      tone: "success",
    }
  }

  if (deliveryStatus === "IN_TRANSIT") {
    return {
      title: "Seguir el último tramo",
      description: hasRecentSignal(tracking?.updatedAt ?? null)
        ? "El runner ya está en reparto. El mapa y la ETA deberían reflejar el avance del último tramo."
        : "El runner ya está en reparto, pero la señal reciente no ha llegado todavía. Conviene seguir el mapa y la última actualización.",
      tone: "info",
    }
  }

  if (deliveryStatus === "PICKED_UP") {
    return {
      title: "Salida a entrega inminente",
      description:
        "La recogida ya está completada. El siguiente paso es que el runner active el último tramo y comience la entrega.",
      tone: "info",
    }
  }

  if (deliveryStatus === "PICKUP_PENDING" || deliveryStatus === "RUNNER_ASSIGNED") {
    return {
      title: "Esperando recogida",
      description:
        "El runner ya está asignado y el pedido se está preparando para la recogida. El mapa ganará precisión cuando arranque el movimiento operativo.",
      tone: "info",
    }
  }

  if (deliveryStatus === "CANCELLED" || orderStatus === "CANCELLED") {
    return {
      title: "Flujo operativo cerrado",
      description:
        "La entrega ya no seguirá adelante. Si necesitas contexto adicional, conviene revisar el detalle del pedido o soporte.",
      tone: "warning",
    }
  }

  return {
    title: "Esperando actualización operativa",
    description:
      "El pedido sigue en curso, pero todavía no hay una fase de reparto suficientemente avanzada como para proyectar el siguiente movimiento.",
    tone: "info",
  }
}
