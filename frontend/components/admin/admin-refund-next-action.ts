import type { AdminRefundSummary } from "@/lib/types"

export type AdminRefundQueueNextActionSummary = {
  title: string
  description: string
  tone: "info" | "warning" | "success"
}

export function getAdminRefundQueueNextActionSummary(refunds: AdminRefundSummary[]) {
  const requested = refunds.filter((refund) => refund.status === "REQUESTED").length
  const underReview = refunds.filter((refund) => refund.status === "UNDER_REVIEW").length
  const approved = refunds.filter((refund) => refund.status === "APPROVED").length
  const failed = refunds.filter((refund) => refund.status === "FAILED").length

  if (requested > 0) {
    return {
      title: "Priorizar solicitudes nuevas",
      description:
        requested > 1
          ? `Hay ${requested} devoluciones recién solicitadas esperando triage inicial.`
          : "Hay una devolución recién solicitada esperando triage inicial.",
      tone: "warning",
    } satisfies AdminRefundQueueNextActionSummary
  }

  if (underReview > 0) {
    return {
      title: "Cerrar revisión en curso",
      description:
        underReview > 1
          ? `Hay ${underReview} devoluciones en revisión. Conviene aprobar o rechazar para no estancar la cola.`
          : "Hay una devolución en revisión. Conviene aprobar o rechazar para no estancar la cola.",
      tone: "info",
    } satisfies AdminRefundQueueNextActionSummary
  }

  if (approved > 0) {
    return {
      title: "Ejecutar devoluciones aprobadas",
      description:
        approved > 1
          ? `Hay ${approved} devoluciones aprobadas pendientes de ejecución.`
          : "Hay una devolución aprobada pendiente de ejecución.",
      tone: "info",
    } satisfies AdminRefundQueueNextActionSummary
  }

  if (failed > 0) {
    return {
      title: "Revisar fallos de ejecución",
      description:
        failed > 1
          ? `Hay ${failed} devoluciones fallidas. Conviene revisar referencias externas y contexto económico.`
          : "Hay una devolución fallida. Conviene revisar referencias externas y contexto económico.",
      tone: "warning",
    } satisfies AdminRefundQueueNextActionSummary
  }

  return {
    title: "Cola económica estabilizada",
    description:
      refunds.length > 0
        ? "No quedan acciones manuales urgentes en la cola de devoluciones."
        : "No hay devoluciones activas en cola ahora mismo.",
    tone: refunds.length > 0 ? "success" : "info",
  } satisfies AdminRefundQueueNextActionSummary
}

export type AdminRefundCaseNextActionSummary = AdminRefundQueueNextActionSummary

export function getAdminRefundCaseNextActionSummary(refund: {
  status: string
  externalRefundId?: string | null
  incidentId?: string | null
}) {
  if (refund.status === "REQUESTED") {
    return {
      title: "Abrir revisión del caso",
      description:
        "El siguiente paso es validar el alcance económico y mover la devolución a revisión para que el caso deje de estar solo en espera.",
      tone: "warning",
    } satisfies AdminRefundCaseNextActionSummary
  }

  if (refund.status === "UNDER_REVIEW") {
    return {
      title: "Resolver decisión económica",
      description:
        refund.incidentId
          ? "El caso está en revisión y además nace de una incidencia. Conviene cerrar decisión y mantener ambos contextos alineados."
          : "El caso está en revisión. El siguiente paso es aprobar o rechazar con criterio económico claro.",
      tone: "info",
    } satisfies AdminRefundCaseNextActionSummary
  }

  if (refund.status === "APPROVED") {
    return {
      title: "Ejecutar devolución",
      description:
        "La devolución ya está aprobada. El siguiente paso es lanzarla y registrar la referencia externa cuando exista.",
      tone: "info",
    } satisfies AdminRefundCaseNextActionSummary
  }

  if (refund.status === "EXECUTING") {
    return {
      title: "Confirmar resultado externo",
      description:
        refund.externalRefundId
          ? "La devolución ya tiene referencia externa. El siguiente paso es confirmar que el proveedor de pagos la haya completado."
          : "La devolución está ejecutándose. Conviene comprobar la referencia externa y su cierre real.",
      tone: "info",
    } satisfies AdminRefundCaseNextActionSummary
  }

  if (refund.status === "FAILED") {
    return {
      title: "Revisar fallo de devolución",
      description:
        "El flujo económico no se cerró bien. El siguiente paso es revisar el proveedor externo y decidir si toca reintentar o escalar.",
      tone: "warning",
    } satisfies AdminRefundCaseNextActionSummary
  }

  return {
    title: "Caso económico cerrado",
    description:
      "La devolución ya no requiere una acción manual inmediata desde backoffice, salvo seguimiento puntual o auditoría.",
    tone: "success",
  } satisfies AdminRefundCaseNextActionSummary
}
