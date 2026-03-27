import { api } from "@/lib/api"
import type { DeliveryIncidentSummary } from "@/lib/types"

type BackendDeliveryIncidentSummary = {
  id: string
  orderId?: string | null
  deliveryOrderId: string
  reporterRole: "CLIENT" | "RUNNER" | "PROVIDER" | "ADMIN"
  type:
    | "MISSING_ITEMS"
    | "DAMAGED_ITEMS"
    | "WRONG_DELIVERY"
    | "FAILED_DELIVERY"
    | "ADDRESS_PROBLEM"
    | "SAFETY_CONCERN"
    | "OTHER"
  status: "OPEN" | "UNDER_REVIEW" | "RESOLVED" | "REJECTED"
  description: string
  evidenceUrl?: string | null
  createdAt: string
  resolvedAt?: string | null
}

function mapIncident(
  incident: BackendDeliveryIncidentSummary,
): DeliveryIncidentSummary {
  return {
    id: incident.id,
    orderId: incident.orderId ?? null,
    deliveryOrderId: incident.deliveryOrderId,
    reporterRole: incident.reporterRole,
    type: incident.type,
    status: incident.status,
    description: incident.description,
    evidenceUrl: incident.evidenceUrl ?? null,
    createdAt: incident.createdAt,
    resolvedAt: incident.resolvedAt ?? null,
  }
}

export const deliveryIncidentsService = {
  async listMyIncidents() {
    const data = await api.get<BackendDeliveryIncidentSummary[]>(
      "/delivery/incidents/me",
    )
    return data.map(mapIncident)
  },

  async listDeliveryOrderIncidents(deliveryOrderId: string) {
    const data = await api.get<BackendDeliveryIncidentSummary[]>(
      `/delivery/orders/${deliveryOrderId}/incidents`,
    )
    return data.map(mapIncident)
  },

  async createIncident(payload: {
    deliveryOrderId: string
    type:
      | "MISSING_ITEMS"
      | "DAMAGED_ITEMS"
      | "WRONG_DELIVERY"
      | "FAILED_DELIVERY"
      | "ADDRESS_PROBLEM"
      | "SAFETY_CONCERN"
      | "OTHER"
    description: string
    evidenceUrl?: string
  }) {
    const data = await api.post<BackendDeliveryIncidentSummary>(
      "/delivery/incidents",
      payload,
    )
    return mapIncident(data)
  },
}
