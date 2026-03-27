import { beforeEach, describe, expect, it, vi } from "vitest"

const apiGetMock = vi.fn()
const apiPostMock = vi.fn()

vi.mock("@/lib/api", () => ({
  api: {
    get: (...args: unknown[]) => apiGetMock(...args),
    post: (...args: unknown[]) => apiPostMock(...args),
  },
}))

describe("refunds-service", () => {
  beforeEach(() => {
    apiGetMock.mockReset()
    apiPostMock.mockReset()
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

  it("maps delivery order refunds into frontend summaries", async () => {
    apiGetMock.mockResolvedValueOnce([
      {
        id: "refund-2",
        providerOrderId: null,
        deliveryOrderId: "delivery-order-1",
        type: "DELIVERY_FULL",
        status: "APPROVED",
        amount: 4,
        currency: "EUR",
        requestedById: "client-1",
        reviewedById: "admin-1",
        externalRefundId: "re_1",
        createdAt: "2026-03-27T10:00:00.000Z",
        reviewedAt: "2026-03-27T12:00:00.000Z",
        completedAt: null,
      },
    ])

    const { refundsService } = await import("@/lib/services/refunds-service")
    const refunds = await refundsService.getDeliveryOrderRefunds("delivery-order-1")

    expect(apiGetMock).toHaveBeenCalledWith("/refunds/delivery-order/delivery-order-1")
    expect(refunds).toEqual([
      expect.objectContaining({
        id: "refund-2",
        deliveryOrderId: "delivery-order-1",
        amount: 4,
        status: "APPROVED",
      }),
    ])
  })

  it("maps the client-wide refund inbox with order links", async () => {
    apiGetMock.mockResolvedValueOnce([
      {
        id: "refund-4",
        orderId: "order-1",
        providerOrderId: "provider-order-1",
        deliveryOrderId: null,
        type: "PROVIDER_FULL",
        status: "COMPLETED",
        amount: "14.20",
        currency: "EUR",
        requestedById: "client-1",
        reviewedById: "admin-1",
        externalRefundId: "re_done",
        createdAt: "2026-03-27T14:00:00.000Z",
        reviewedAt: "2026-03-27T15:00:00.000Z",
        completedAt: "2026-03-27T16:00:00.000Z",
      },
    ])

    const { refundsService } = await import("@/lib/services/refunds-service")
    const refunds = await refundsService.getMyRefunds()

    expect(apiGetMock).toHaveBeenCalledWith("/refunds/me")
    expect(refunds).toEqual([
      expect.objectContaining({
        id: "refund-4",
        orderId: "order-1",
        amount: 14.2,
        status: "COMPLETED",
      }),
    ])
  })

  it("submits refund requests through the backend contract", async () => {
    apiPostMock.mockResolvedValueOnce({
      id: "refund-3",
      providerOrderId: "provider-order-9",
      deliveryOrderId: null,
      incidentId: null,
      type: "PROVIDER_PARTIAL",
      status: "REQUESTED",
      amount: "9.99",
      currency: "EUR",
      requestedById: "client-2",
      reviewedById: null,
      externalRefundId: null,
      createdAt: "2026-03-27T13:00:00.000Z",
      reviewedAt: null,
      completedAt: null,
    })

    const { refundsService } = await import("@/lib/services/refunds-service")
    const refund = await refundsService.requestRefund({
      providerOrderId: "provider-order-9",
      type: "PROVIDER_PARTIAL",
      amount: 9.99,
      currency: "EUR",
    })

    expect(apiPostMock).toHaveBeenCalledWith("/refunds", {
      providerOrderId: "provider-order-9",
      type: "PROVIDER_PARTIAL",
      amount: 9.99,
      currency: "EUR",
    })
    expect(refund).toMatchObject({
      id: "refund-3",
      providerOrderId: "provider-order-9",
      amount: 9.99,
      status: "REQUESTED",
    })
  })
})
