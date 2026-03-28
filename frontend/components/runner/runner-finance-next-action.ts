import type { PaymentConnectStatusSummary } from "@/lib/types"

export type RunnerFinanceNextActionInput = {
  connectStatus: PaymentConnectStatusSummary | null
  paidOrderCount: number
  pendingOrderCount: number
  visibleRefundCount: number
  visibleIncidentCount: number
}

export type RunnerFinanceNextActionSummary = {
  title: string
  description: string
  tone: "info" | "warning" | "success"
}

export function getRunnerFinanceNextActionSummary({
  connectStatus,
  paidOrderCount,
  pendingOrderCount,
  visibleRefundCount,
  visibleIncidentCount,
}: RunnerFinanceNextActionInput): RunnerFinanceNextActionSummary {
  if (!connectStatus || connectStatus.status === "NOT_CONNECTED") {
    return {
      title: "Conectar cobro del runner",
      description:
        "Sin Stripe Connect no podrás liquidar repartos reales. El siguiente paso es conectar o iniciar el onboarding de la cuenta.",
      tone: "warning",
    }
  }

  if (connectStatus.status === "ONBOARDING_REQUIRED") {
    return {
      title: "Completar onboarding de cobro",
      description:
        "La cuenta ya existe, pero todavía faltan requisitos para poder liquidar repartos con normalidad.",
      tone: "warning",
    }
  }

  if (connectStatus.status === "REVIEW_REQUIRED") {
    return {
      title: "Revisar restricciones de Stripe",
      description:
        "La cuenta está detectada, pero sigue bloqueada o pendiente de validación. Conviene resolverlo antes de fiarse del circuito económico.",
      tone: "warning",
    }
  }

  if (visibleRefundCount > 0 || visibleIncidentCount > 0) {
    return {
      title: "Priorizar soporte económico",
      description:
        "Hay devoluciones o incidencias visibles asociadas a tus repartos. Antes de cerrar este frente conviene revisarlas desde soporte operativo.",
      tone: "warning",
    }
  }

  if (pendingOrderCount > 0) {
    return {
      title: "Seguir cobros pendientes",
      description:
        pendingOrderCount > 1
          ? `Tienes ${pendingOrderCount} repartos con cobro todavía abierto. Conviene vigilar su progreso hasta que queden liquidados.`
          : "Tienes un reparto con cobro todavía abierto. Conviene vigilar su progreso hasta que quede liquidado.",
      tone: "info",
    }
  }

  if (paidOrderCount > 0) {
    return {
      title: "Liquidaciones del runner encaminadas",
      description:
        "El circuito económico visible del reparto está sano. El siguiente paso es mantener seguimiento y soporte sin incidencias abiertas.",
      tone: "success",
    }
  }

  return {
    title: "Esperar primeros cobros visibles",
    description:
      "Todavía no hay repartos cobrados en este centro. El siguiente paso es completar entregas y mantener Stripe listo para liquidación.",
    tone: "info",
  }
}
