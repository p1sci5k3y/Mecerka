import type { ProviderOrder } from "@/lib/types"

type RunnerNextActionInput = {
  deliveryStatus?: string | null
  paymentStatus?: string | null
  activeStops: ProviderOrder[]
  openSupportCount: number
}

export type RunnerNextActionSummary = {
  title: string
  description: string
  tone: "info" | "warning" | "success"
}

function pendingPickupCount(activeStops: ProviderOrder[]) {
  return activeStops.filter(
    (providerOrder) =>
      providerOrder.status === "READY_FOR_PICKUP" ||
      providerOrder.status === "PREPARING" ||
      providerOrder.status === "ACCEPTED" ||
      providerOrder.status === "PENDING",
  ).length
}

export function getRunnerNextActionSummary({
  deliveryStatus,
  paymentStatus,
  activeStops,
  openSupportCount,
}: RunnerNextActionInput): RunnerNextActionSummary {
  if (openSupportCount > 0) {
    return {
      title: "Revisar soporte visible",
      description:
        "Hay incidencias o devoluciones abiertas asociadas a esta entrega. Conviene operar con ese contexto antes de darla por cerrada.",
      tone: "warning",
    }
  }

  if (deliveryStatus === "CANCELLED") {
    return {
      title: "Flujo operativo cerrado",
      description:
        "La entrega ya no seguirá adelante. El siguiente paso es verificar que no queda ninguna recogida o cobro pendiente.",
      tone: "warning",
    }
  }

  if (deliveryStatus === "DELIVERED") {
    if (paymentStatus === "PAYMENT_PENDING" || paymentStatus === "PAYMENT_READY") {
      return {
        title: "Revisar cobro del reparto",
        description:
          "La entrega ya consta como completada, pero el cobro del runner todavía no está cerrado. Revisa el centro financiero.",
        tone: "info",
      }
    }

    return {
      title: "Entrega cerrada",
      description:
        "La operación principal ya terminó. El siguiente paso es confirmar que el cobro y el soporte quedan sin flecos.",
      tone: "success",
    }
  }

  if (deliveryStatus === "IN_TRANSIT") {
    return {
      title: "Completar la entrega final",
      description:
        "El reparto ya está en marcha. El objetivo ahora es cerrar el último tramo y confirmar la entrega al cliente.",
      tone: "info",
    }
  }

  if (deliveryStatus === "PICKED_UP") {
    return {
      title: "Salir al último tramo",
      description:
        "Las recogidas principales ya están hechas. El siguiente paso operativo es arrancar la entrega final al cliente.",
      tone: "info",
    }
  }

  if (deliveryStatus === "ASSIGNED" || deliveryStatus === "RUNNER_ASSIGNED" || deliveryStatus === "PICKUP_PENDING") {
    const pendingStops = pendingPickupCount(activeStops)
    return {
      title: "Coordinar recogida",
      description:
        pendingStops > 1
          ? `Quedan ${pendingStops} paradas activas por consolidar antes de salir a entrega.`
          : pendingStops === 1
            ? "Queda una recogida activa por completar antes de salir a entrega."
            : "La ruta está asignada y lista para arrancar en cuanto el contexto operativo quede preparado.",
      tone: "info",
    }
  }

  return {
    title: "Esperando contexto operativo",
    description:
      "Todavía no hay un estado suficientemente claro como para recomendar una acción específica al runner.",
    tone: "info",
  }
}
