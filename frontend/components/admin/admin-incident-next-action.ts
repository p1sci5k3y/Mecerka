export type AdminIncidentCaseNextActionSummary = {
  title: string
  description: string
  tone: "info" | "warning" | "success"
}

export function getAdminIncidentCaseNextActionSummary(incident: {
  status: string
  evidenceUrl?: string | null
  orderId?: string | null
  deliveryOrderId?: string | null
}) {
  if (incident.status === "OPEN") {
    return {
      title: "Abrir revisión operativa",
      description:
        "La incidencia todavía está abierta sin triage. El siguiente paso es ponerla en revisión y validar contexto de pedido o reparto.",
      tone: "warning",
    } satisfies AdminIncidentCaseNextActionSummary
  }

  if (incident.status === "UNDER_REVIEW") {
    return {
      title: "Cerrar decisión del caso",
      description:
        incident.evidenceUrl?.trim()
          ? "La incidencia ya está en revisión y tiene evidencia adjunta. Conviene resolver o rechazar para no dejar el caso bloqueado."
          : "La incidencia ya está en revisión. Conviene resolver o rechazar aunque la evidencia sea limitada.",
      tone: "info",
    } satisfies AdminIncidentCaseNextActionSummary
  }

  if (incident.status === "RESOLVED") {
    return {
      title: "Caso operativo cerrado",
      description:
        incident.orderId || incident.deliveryOrderId
          ? "La incidencia ya quedó resuelta. El siguiente paso es confirmar que pedido, reparto y soporte quedan alineados."
          : "La incidencia ya quedó resuelta y no requiere una acción manual inmediata.",
      tone: "success",
    } satisfies AdminIncidentCaseNextActionSummary
  }

  return {
    title: "Caso operativo cerrado sin continuidad",
    description:
      "La incidencia ya no requiere una acción manual inmediata desde backoffice, salvo seguimiento puntual o auditoría.",
    tone: "success",
  } satisfies AdminIncidentCaseNextActionSummary
}
