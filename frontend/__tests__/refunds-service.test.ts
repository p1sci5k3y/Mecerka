import { beforeEach, describe, expect, it, vi } from "vitest"

const apiGetMock = vi.fn()

vi.mock("@/lib/api", () => ({
  api: {
    get: (...args: unknown[]) => apiGetMock(...args),
  },
}))

describe("refunds-service", () => {
  beforeEach(() => {
    apiGetMock.mockReset()
  })

  it("maps provider order refunds into frontend summaries", async () => {
    apiGetMock.mockResolvedValueOnce([
      {
        id: "refund-1",
        providerOrderId: "provider-order-1",
        deliveryOrderId: null,
        type: "PROVIDER_PARTIAL",
        status: "REQUESTED",
        amount: "12.50",
        currency: "EUR",
        requestedById: "client-1",
        reviewedById: null,
        externalRefundId: null,
        createdAt: "2026-03-26T10:00:00.000Z",
        reviewedAt: null,
        completedAt: null,
      },
    ])

    const { refundsService } = await import("@/lib/services/refunds-service")
    const refunds = await refundsService.getProviderOrderRefunds("provider-order-1")

    expect(apiGetMock).toHaveBeenCalledWith("/refunds/provider-order/provider-order-1")
    expect(refunds).toEqual([
      expect.objectContaining({
        id: "refund-1",
        providerOrderId: "provider-order-1",
        amount: 12.5,
        status: "REQUESTED",
      }),
    ])
  })
})
