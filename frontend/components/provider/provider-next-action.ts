import type { ProviderOrder } from "@/lib/types"

type ProviderNextActionInput = {
  providerStatus: ProviderOrder["status"]
  paymentStatus?: string
  rootOrderStatus?: string | null
  deliveryStatus?: string | null
  openSupportCount: number
}

export type ProviderNextActionSummary = {
  title: string
  description: string
  tone: "info" | "warning" | "success"
}

export function getProviderNextActionSummary({
  providerStatus,
  paymentStatus,
  rootOrderStatus,
  deliveryStatus,
  openSupportCount,
}: ProviderNextActionInput): ProviderNextActionSummary {
  if (openSupportCount > 0) {
    return {
      title: "Revisar soporte visible",
      description:
        "Hay incidencias o devoluciones asociadas a este tramo. Conviene operar con ese contexto antes de dar el pedido por cerrado.",
      tone: "warning",
    }
  }

  if (providerStatus === "REJECTED_BY_STORE" || providerStatus === "CANCELLED") {
    return {
      title: "Flujo del comercio cerrado",
      description:
        "Este tramo ya no seguirá adelante desde el comercio. El siguiente paso es verificar que no queda ningún cobro o soporte pendiente.",
      tone: "warning",
    }
  }

  if (providerStatus === "DELIVERED") {
    if (paymentStatus === "FAILED" || paymentStatus === "PAYMENT_PENDING") {
      return {
        title: "Revisar cobro del comercio",
        description:
          "El pedido ya figura como entregado, pero el cobro de este tramo no está cerrado. Conviene revisar finanzas.",
        tone: "info",
      }
    }

    return {
      title: "Tramo del comercio completado",
      description:
        "La parte operativa del comercio ya terminó. El siguiente paso es confirmar que cobro y soporte quedan sin flecos.",
      tone: "success",
    }
  }

  if (providerStatus === "PICKED_UP") {
    return {
      title: "Esperar cierre de entrega",
      description:
        "El pedido ya salió del comercio. El siguiente paso es seguir el estado del reparto hasta la entrega final.",
      tone: "info",
    }
  }

  if (providerStatus === "READY_FOR_PICKUP") {
    return {
      title: "Preparado para recogida",
      description:
        "Este tramo ya está listo para que el runner lo recoja. Conviene vigilar asignación y salida del reparto.",
      tone: "info",
    }
  }

  if (providerStatus === "PREPARING" || providerStatus === "ACCEPTED" || providerStatus === "PENDING") {
    return {
      title: "Preparar pedido del comercio",
      description:
        rootOrderStatus === "CONFIRMED" || deliveryStatus === "ASSIGNED"
          ? "El pedido ya está en flujo operativo. El siguiente paso es dejarlo listo para recogida."
          : "Todavía toca preparar y consolidar este tramo antes de que el reparto entre en fase activa.",
      tone: "info",
    }
  }

  return {
    title: "Esperando contexto operativo",
    description:
      "Aún no hay una fase suficientemente clara como para recomendar una siguiente acción específica al comercio.",
    tone: "info",
  }
}
