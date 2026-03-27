import { beforeEach, describe, expect, it, vi } from "vitest"

const apiGetMock = vi.fn()
const apiPostMock = vi.fn()

vi.mock("@/lib/api", () => ({
  api: {
    get: (...args: unknown[]) => apiGetMock(...args),
    post: (...args: unknown[]) => apiPostMock(...args),
  },
}))

describe("delivery-incidents-service", () => {
  beforeEach(() => {
    apiGetMock.mockReset()
    apiPostMock.mockReset()
  })

  it("maps delivery incidents into frontend summaries", async () => {
    apiGetMock.mockResolvedValueOnce([
      {
        id: "incident-1",
        deliveryOrderId: "delivery-1",
        reporterRole: "CLIENT",
        type: "MISSING_ITEMS",
        status: "OPEN",
        description: "Faltan dos productos",
        evidenceUrl: null,
        createdAt: "2026-03-27T10:00:00.000Z",
        resolvedAt: null,
      },
    ])

    const { deliveryIncidentsService } = await import(
      "@/lib/services/delivery-incidents-service"
    )
    const incidents = await deliveryIncidentsService.listDeliveryOrderIncidents("delivery-1")

    expect(apiGetMock).toHaveBeenCalledWith("/delivery/orders/delivery-1/incidents")
    expect(incidents).toEqual([
      expect.objectContaining({
        id: "incident-1",
        deliveryOrderId: "delivery-1",
        status: "OPEN",
      }),
    ])
  })

  it("maps the client-wide incident inbox with order links", async () => {
    apiGetMock.mockResolvedValueOnce([
      {
        id: "incident-3",
        orderId: "order-9",
        deliveryOrderId: "delivery-9",
        reporterRole: "CLIENT",
        type: "FAILED_DELIVERY",
        status: "UNDER_REVIEW",
        description: "El repartidor no pudo completar la entrega",
        evidenceUrl: null,
        createdAt: "2026-03-27T12:00:00.000Z",
        resolvedAt: null,
      },
    ])

    const { deliveryIncidentsService } = await import(
      "@/lib/services/delivery-incidents-service"
    )
    const incidents = await deliveryIncidentsService.listMyIncidents()

    expect(apiGetMock).toHaveBeenCalledWith("/delivery/incidents/me")
    expect(incidents).toEqual([
      expect.objectContaining({
        id: "incident-3",
        orderId: "order-9",
        deliveryOrderId: "delivery-9",
        status: "UNDER_REVIEW",
      }),
    ])
  })

  it("creates delivery incidents through the backend contract", async () => {
    apiPostMock.mockResolvedValueOnce({
      id: "incident-2",
      deliveryOrderId: "delivery-2",
      reporterRole: "CLIENT",
      type: "DAMAGED_ITEMS",
      status: "OPEN",
      description: "La caja llegó rota",
      evidenceUrl: "https://example.com/photo.jpg",
      createdAt: "2026-03-27T11:00:00.000Z",
      resolvedAt: null,
    })

    const { deliveryIncidentsService } = await import(
      "@/lib/services/delivery-incidents-service"
    )
    const incident = await deliveryIncidentsService.createIncident({
      deliveryOrderId: "delivery-2",
      type: "DAMAGED_ITEMS",
      description: "La caja llegó rota",
      evidenceUrl: "https://example.com/photo.jpg",
    })

    expect(apiPostMock).toHaveBeenCalledWith("/delivery/incidents", {
      deliveryOrderId: "delivery-2",
      type: "DAMAGED_ITEMS",
      description: "La caja llegó rota",
      evidenceUrl: "https://example.com/photo.jpg",
    })
    expect(incident).toMatchObject({
      id: "incident-2",
      deliveryOrderId: "delivery-2",
      status: "OPEN",
    })
  })
})
