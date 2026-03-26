import { api } from "@/lib/api"
import type { RefundSummary } from "@/lib/types"

type BackendRefundSummary = {
  id: string
  incidentId?: string | null
  providerOrderId?: string | null
  deliveryOrderId?: string | null
  type: string
  status: string
  amount: string | number
  currency: string
  requestedById: string
  reviewedById?: string | null
  externalRefundId?: string | null
  createdAt: string
  reviewedAt?: string | null
  completedAt?: string | null
}

function mapRefund(refund: BackendRefundSummary): RefundSummary {
  return {
    id: String(refund.id),
    incidentId: refund.incidentId ?? null,
    providerOrderId: refund.providerOrderId ?? null,
    deliveryOrderId: refund.deliveryOrderId ?? null,
    type: refund.type,
    status: refund.status,
    amount: typeof refund.amount === "number" ? refund.amount : Number(refund.amount),
    currency: refund.currency,
    requestedById: refund.requestedById,
    reviewedById: refund.reviewedById ?? null,
    externalRefundId: refund.externalRefundId ?? null,
    createdAt: refund.createdAt,
    reviewedAt: refund.reviewedAt ?? null,
    completedAt: refund.completedAt ?? null,
  }
}

export const refundsService = {
  async getProviderOrderRefunds(providerOrderId: string) {
    const data = await api.get<BackendRefundSummary[]>(
      `/refunds/provider-order/${providerOrderId}`,
    )
    return data.map(mapRefund)
  },
}
