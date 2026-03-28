import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import type { Order } from "@/lib/types"

const mockUseParams = vi.fn()
const getOneMock = vi.fn()
const listDeliveryOrderIncidentsMock = vi.fn()
const getDeliveryOrderRefundsMock = vi.fn()
const dynamicDeliveryMapMock = vi.fn()

vi.mock("next/navigation", () => ({
  useParams: () => mockUseParams(),
}))

vi.mock("@/lib/services/orders-service", () => ({
  ordersService: {
    getOne: (...args: unknown[]) => getOneMock(...args),
  },
}))

vi.mock("@/lib/services/delivery-incidents-service", () => ({
  deliveryIncidentsService: {
    listDeliveryOrderIncidents: (...args: unknown[]) => listDeliveryOrderIncidentsMock(...args),
  },
}))

vi.mock("@/lib/services/refunds-service", () => ({
  refundsService: {
    getDeliveryOrderRefunds: (...args: unknown[]) => getDeliveryOrderRefundsMock(...args),
  },
}))

vi.mock("@/components/protected-route", () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock("@/components/navbar", () => ({
  Navbar: () => <nav data-testid="navbar" />,
}))

vi.mock("@/components/footer", () => ({
  Footer: () => <footer data-testid="footer" />,
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    asChild,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) =>
    asChild ? <>{children}</> : <button {...rest}>{children}</button>,
}))

vi.mock("@/lib/navigation", () => ({
  Link: ({ href, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock("@/components/tracking/DynamicDeliveryMap", () => ({
  default: (props: unknown) => {
    dynamicDeliveryMapMock(props)
    return <div data-testid="runner-delivery-map" />
  },
}))

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    userId: "client-1",
    total: 48,
    deliveryFee: 5.5,
    status: "IN_TRANSIT",
    createdAt: "2026-03-27T10:00:00.000Z",
    updatedAt: "2026-03-27T11:00:00.000Z",
    city: "Sevilla",
    deliveryAddress: "Calle Feria 12",
    deliveryDistanceKm: 3.4,
    items: [],
    providerOrders: [
      {
        id: "provider-order-1",
        providerId: "provider-1",
        providerName: "Cerámica Norte",
        status: "READY_FOR_PICKUP",
        paymentStatus: "PAID",
        subtotal: 24,
        originalSubtotal: 24,
        discountAmount: 0,
        items: [
          {
            id: "item-1",
            productId: "prod-1",
            quantity: 2,
            unitPrice: 12,
            baseUnitPrice: 12,
            appliedDiscountUnitPrice: null,
            discountAmount: 0,
          },
        ],
      },
    ],
    deliveryOrder: {
      id: "delivery-1",
      runnerId: "runner-1",
      status: "IN_TRANSIT",
      paymentStatus: "PAYMENT_PENDING",
    },
    ...overrides,
  }
}

describe("RunnerOrderDetailPage", () => {
  beforeEach(() => {
    mockUseParams.mockReset()
    getOneMock.mockReset()
    listDeliveryOrderIncidentsMock.mockReset()
    getDeliveryOrderRefundsMock.mockReset()
    dynamicDeliveryMapMock.mockReset()
    mockUseParams.mockReturnValue({ id: "order-1" })
  })

  it("renders the operational delivery hub with payout and route links", async () => {
    getOneMock.mockResolvedValueOnce(makeOrder())
    listDeliveryOrderIncidentsMock.mockResolvedValueOnce([
      {
        id: "incident-1",
        deliveryOrderId: "delivery-1",
        reporterRole: "CLIENT",
        type: "FAILED_DELIVERY",
        status: "OPEN",
        description: "El cliente reportó retraso",
        evidenceUrl: null,
        createdAt: "2026-03-27T12:00:00.000Z",
        resolvedAt: null,
      },
    ])
    getDeliveryOrderRefundsMock.mockResolvedValueOnce([
      {
        id: "refund-1",
        incidentId: "incident-1",
        providerOrderId: null,
        deliveryOrderId: "delivery-1",
        type: "DELIVERY_PARTIAL",
        status: "UNDER_REVIEW",
        amount: 3,
        currency: "EUR",
        requestedById: "client-1",
        reviewedById: null,
        externalRefundId: null,
        createdAt: "2026-03-27T12:05:00.000Z",
        reviewedAt: null,
        completedAt: null,
      },
    ])

    const Page = (await import("@/app/[locale]/runner/orders/[id]/page")).default
    render(<Page />)

    expect(await screen.findByText("Ficha de entrega del runner")).toBeInTheDocument()
    expect(screen.getByText("Siguiente acción operativa")).toBeInTheDocument()
    expect(screen.getByText("Revisar soporte visible")).toBeInTheDocument()
    expect(getOneMock).toHaveBeenCalledWith("order-1")
    expect(listDeliveryOrderIncidentsMock).toHaveBeenCalledWith("delivery-1")
    expect(getDeliveryOrderRefundsMock).toHaveBeenCalledWith("delivery-1")
    expect(screen.getByText("Cerámica Norte")).toBeInTheDocument()
    expect(screen.getByText("Calle Feria 12")).toBeInTheDocument()
    expect(await screen.findByTestId("runner-delivery-map")).toBeInTheDocument()
    expect(screen.getAllByText("Pago pendiente")).toHaveLength(2)
    expect(screen.getByText("El cliente reportó retraso")).toBeInTheDocument()
    expect(screen.getByText("DELIVERY_PARTIAL")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Abrir cobros del runner/i })).toHaveAttribute(
      "href",
      "/runner/finance",
    )
    expect(screen.getByRole("link", { name: /Abrir soporte/i })).toHaveAttribute(
      "href",
      "/runner/support",
    )
    await waitFor(() => {
      expect(dynamicDeliveryMapMock).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: "order-1",
          isRunner: true,
        }),
      )
    })
  })

  it("shows a safe error state when the delivery cannot be loaded", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    getOneMock.mockRejectedValueOnce(new Error("boom"))

    const Page = (await import("@/app/[locale]/runner/orders/[id]/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("No pudimos cargar esta entrega.")).toBeInTheDocument()
    })

    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it("filters cancelled stops from the route summary and degrades support fetches safely", async () => {
    getOneMock.mockResolvedValueOnce(
      makeOrder({
        providerOrders: [
          {
            id: "provider-order-1",
            providerId: "provider-1",
            providerName: "Cerámica Norte",
            status: "READY_FOR_PICKUP",
            paymentStatus: "PAID",
            subtotal: 24,
            originalSubtotal: 24,
            discountAmount: 0,
            items: [{ id: "item-1", productId: "prod-1", quantity: 2, unitPrice: 12, baseUnitPrice: 12, appliedDiscountUnitPrice: null, discountAmount: 0 }],
          },
          {
            id: "provider-order-2",
            providerId: "provider-2",
            providerName: "Textil Sur",
            status: "CANCELLED",
            paymentStatus: "FAILED",
            subtotal: 12,
            originalSubtotal: 12,
            discountAmount: 0,
            items: [{ id: "item-2", productId: "prod-2", quantity: 4, unitPrice: 3, baseUnitPrice: 3, appliedDiscountUnitPrice: null, discountAmount: 0 }],
          },
        ],
      }),
    )
    listDeliveryOrderIncidentsMock.mockRejectedValueOnce(new Error("offline"))
    getDeliveryOrderRefundsMock.mockRejectedValueOnce(new Error("offline"))

    const Page = (await import("@/app/[locale]/runner/orders/[id]/page")).default
    render(<Page />)

    expect(await screen.findByText("Ficha de entrega del runner")).toBeInTheDocument()
    expect(screen.getByText("1")).toBeInTheDocument()
    expect(screen.getByText("2")).toBeInTheDocument()
    expect(screen.getAllByText("0")).toHaveLength(2)
    expect(screen.queryByText("Textil Sur")).not.toBeInTheDocument()
    expect(await screen.findByTestId("runner-delivery-map")).toBeInTheDocument()
  })

  it("does not query incidents or refunds when the order has no delivery order", async () => {
    getOneMock.mockResolvedValueOnce(
      makeOrder({
        deliveryOrder: undefined,
      }),
    )

    const Page = (await import("@/app/[locale]/runner/orders/[id]/page")).default
    render(<Page />)

    expect(await screen.findByText("Ficha de entrega del runner")).toBeInTheDocument()
    expect(listDeliveryOrderIncidentsMock).not.toHaveBeenCalled()
    expect(getDeliveryOrderRefundsMock).not.toHaveBeenCalled()
    expect(screen.getAllByText("Sin estado").length).toBeGreaterThan(0)
    expect(screen.getByText(/La ruta se habilitará/i)).toBeInTheDocument()
  })

  it("shows fallback route and delivery labels when operational context is sparse", async () => {
    getOneMock.mockResolvedValueOnce(
      makeOrder({
        city: "",
        deliveryAddress: "",
        deliveryDistanceKm: undefined,
        providerOrders: [],
        deliveryOrder: {
          id: "delivery-1",
          runnerId: "runner-1",
          status: "UNKNOWN_STATUS" as never,
          paymentStatus: "UNKNOWN_PAYMENT" as never,
        },
      }),
    )
    listDeliveryOrderIncidentsMock.mockResolvedValueOnce([])
    getDeliveryOrderRefundsMock.mockResolvedValueOnce([])

    const Page = (await import("@/app/[locale]/runner/orders/[id]/page")).default
    render(<Page />)

    expect(await screen.findByText("Ficha de entrega del runner")).toBeInTheDocument()
    expect(screen.getByText("Esperando contexto operativo")).toBeInTheDocument()
    expect(
      screen.getByText("No hay paradas operativas visibles para esta entrega."),
    ).toBeInTheDocument()
    expect(screen.getByText("Pendiente de direccion")).toBeInTheDocument()
    expect(screen.getByText("Sin ciudad")).toBeInTheDocument()
    expect(screen.getByText("No disponible")).toBeInTheDocument()
    expect(
      screen.getByText("No hay incidencias ni devoluciones visibles para esta entrega."),
    ).toBeInTheDocument()
    expect(screen.getAllByText("Sin estado").length).toBeGreaterThan(0)
    expect(screen.getByText("delivery-1")).toBeInTheDocument()
  })

  it("falls back to empty support collections when the runner detail services return non-array payloads", async () => {
    getOneMock.mockResolvedValue(makeOrder())
    listDeliveryOrderIncidentsMock.mockResolvedValue({ invalid: true })
    getDeliveryOrderRefundsMock.mockResolvedValue(null)

    const Page = (await import("@/app/[locale]/runner/orders/[id]/page")).default
    render(<Page />)

    expect(await screen.findByText("Ficha de entrega del runner")).toBeInTheDocument()
    expect(screen.getByText("No hay incidencias ni devoluciones visibles para esta entrega.")).toBeInTheDocument()
    expect(screen.getAllByText("0")).toHaveLength(2)
  })

  it("renders unknown incident and refund statuses as safe fallback labels", async () => {
    getOneMock.mockResolvedValue(makeOrder())
    listDeliveryOrderIncidentsMock.mockResolvedValue([
      {
        id: "incident-1",
        deliveryOrderId: "delivery-1",
        reporterRole: "CLIENT",
        type: "FAILED_DELIVERY",
        status: "UNKNOWN_STATUS" as never,
        description: "El cliente reportó retraso",
        evidenceUrl: null,
        createdAt: "2026-03-27T12:00:00.000Z",
        resolvedAt: null,
      },
    ])
    getDeliveryOrderRefundsMock.mockResolvedValue([
      {
        id: "refund-1",
        incidentId: "incident-1",
        providerOrderId: null,
        deliveryOrderId: "delivery-1",
        type: "DELIVERY_PARTIAL",
        status: "UNKNOWN_STATUS",
        amount: 3,
        currency: "EUR",
        requestedById: "client-1",
        reviewedById: null,
        externalRefundId: null,
        createdAt: "2026-03-27T12:05:00.000Z",
        reviewedAt: null,
        completedAt: null,
      },
    ])

    const Page = (await import("@/app/[locale]/runner/orders/[id]/page")).default
    render(<Page />)

    expect(await screen.findByText("Ficha de entrega del runner")).toBeInTheDocument()
    expect(screen.getAllByText(/Sin estado/i).length).toBeGreaterThan(0)
  })

  it("renders delivered payout and support statuses across the runner hub", async () => {
    getOneMock.mockResolvedValueOnce(
      makeOrder({
        status: "DELIVERED",
        providerOrders: [
          {
            id: "provider-order-1",
            providerId: "provider-1",
            providerName: "Cerámica Norte",
            status: "PICKED_UP",
            paymentStatus: "PAID",
            subtotal: 24,
            originalSubtotal: 24,
            discountAmount: 0,
            items: [{ id: "item-1", productId: "prod-1", quantity: 2, unitPrice: 12, baseUnitPrice: 12, appliedDiscountUnitPrice: null, discountAmount: 0 }],
          },
        ],
        deliveryOrder: {
          id: "delivery-1",
          runnerId: "runner-1",
          status: "DELIVERED",
          paymentStatus: "PAID",
        },
      }),
    )
    listDeliveryOrderIncidentsMock.mockResolvedValueOnce([
      {
        id: "incident-2",
        deliveryOrderId: "delivery-1",
        reporterRole: "CLIENT",
        type: "FAILED_DELIVERY",
        status: "REJECTED",
        description: "Caso rechazado",
        evidenceUrl: null,
        createdAt: "2026-03-27T12:00:00.000Z",
        resolvedAt: null,
      },
    ])
    getDeliveryOrderRefundsMock.mockResolvedValueOnce([
      {
        id: "refund-2",
        incidentId: "incident-2",
        providerOrderId: null,
        deliveryOrderId: "delivery-1",
        type: "DELIVERY_PARTIAL",
        status: "FAILED",
        amount: 3,
        currency: "EUR",
        requestedById: "client-1",
        reviewedById: "admin-1",
        externalRefundId: null,
        createdAt: "2026-03-27T12:05:00.000Z",
        reviewedAt: "2026-03-27T12:10:00.000Z",
        completedAt: null,
      },
    ])

    const Page = (await import("@/app/[locale]/runner/orders/[id]/page")).default
    render(<Page />)

    expect(await screen.findByText("Ficha de entrega del runner")).toBeInTheDocument()
    expect(screen.getAllByText("Cobrado").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Entregado").length).toBeGreaterThan(0)
    expect(screen.getByText("Revisar soporte visible")).toBeInTheDocument()
    expect(screen.getByText("Recogido")).toBeInTheDocument()
    expect(screen.getByText("Rechazada")).toBeInTheDocument()
    expect(screen.getByText("Fallida")).toBeInTheDocument()
  })

  it("stops early when the route param is missing", async () => {
    mockUseParams.mockReturnValue({ id: undefined })

    const Page = (await import("@/app/[locale]/runner/orders/[id]/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(getOneMock).not.toHaveBeenCalled()
    })

    expect(screen.queryByText("No pudimos cargar esta entrega.")).not.toBeInTheDocument()
  })

  it("renders assigned and queued delivery states with varied pickup labels", async () => {
    getOneMock.mockResolvedValueOnce(
      makeOrder({
        status: "ASSIGNED",
        providerOrders: [
          { id: "provider-order-1", providerId: "provider-1", providerName: "Cerámica Norte", status: "PREPARING", paymentStatus: "PAID", subtotal: 24, originalSubtotal: 24, discountAmount: 0, items: [{ id: "item-1", productId: "prod-1", quantity: 2, unitPrice: 12, baseUnitPrice: 12, appliedDiscountUnitPrice: null, discountAmount: 0 }] },
          { id: "provider-order-2", providerId: "provider-2", providerName: "Textil Sur", status: "ACCEPTED", paymentStatus: "PAID", subtotal: 12, originalSubtotal: 12, discountAmount: 0, items: [{ id: "item-2", productId: "prod-2", quantity: 1, unitPrice: 12, baseUnitPrice: 12, appliedDiscountUnitPrice: null, discountAmount: 0 }] },
          { id: "provider-order-3", providerId: "provider-3", providerName: "Pan Sur", status: "PENDING", paymentStatus: "PAID", subtotal: 8, originalSubtotal: 8, discountAmount: 0, items: [{ id: "item-3", productId: "prod-3", quantity: 1, unitPrice: 8, baseUnitPrice: 8, appliedDiscountUnitPrice: null, discountAmount: 0 }] },
        ],
        deliveryOrder: {
          id: "delivery-1",
          runnerId: "runner-1",
          status: "ASSIGNED",
          paymentStatus: "PAYMENT_READY",
        },
      }),
    )
    listDeliveryOrderIncidentsMock.mockResolvedValueOnce([
      {
        id: "incident-1",
        deliveryOrderId: "delivery-1",
        reporterRole: "CLIENT",
        type: "FAILED_DELIVERY",
        status: "UNDER_REVIEW",
        description: "Caso en revisión",
        evidenceUrl: null,
        createdAt: "2026-03-27T12:00:00.000Z",
        resolvedAt: null,
      },
      {
        id: "incident-2",
        deliveryOrderId: "delivery-1",
        reporterRole: "CLIENT",
        type: "FAILED_DELIVERY",
        status: "RESOLVED",
        description: "Caso resuelto",
        evidenceUrl: null,
        createdAt: "2026-03-27T12:00:00.000Z",
        resolvedAt: null,
      },
    ])
    getDeliveryOrderRefundsMock.mockResolvedValueOnce([
      {
        id: "refund-1",
        incidentId: null,
        providerOrderId: null,
        deliveryOrderId: "delivery-1",
        type: "DELIVERY_PARTIAL",
        status: "REQUESTED",
        amount: 2,
        currency: "EUR",
        requestedById: "client-1",
        reviewedById: null,
        externalRefundId: null,
        createdAt: "2026-03-27T12:05:00.000Z",
        reviewedAt: null,
        completedAt: null,
      },
      {
        id: "refund-2",
        incidentId: null,
        providerOrderId: null,
        deliveryOrderId: "delivery-1",
        type: "DELIVERY_PARTIAL",
        status: "APPROVED",
        amount: 2,
        currency: "EUR",
        requestedById: "client-1",
        reviewedById: null,
        externalRefundId: null,
        createdAt: "2026-03-27T12:05:00.000Z",
        reviewedAt: null,
        completedAt: null,
      },
      {
        id: "refund-3",
        incidentId: null,
        providerOrderId: null,
        deliveryOrderId: "delivery-1",
        type: "DELIVERY_PARTIAL",
        status: "EXECUTING",
        amount: 2,
        currency: "EUR",
        requestedById: "client-1",
        reviewedById: null,
        externalRefundId: null,
        createdAt: "2026-03-27T12:05:00.000Z",
        reviewedAt: null,
        completedAt: null,
      },
      {
        id: "refund-4",
        incidentId: null,
        providerOrderId: null,
        deliveryOrderId: "delivery-1",
        type: "DELIVERY_PARTIAL",
        status: "COMPLETED",
        amount: 2,
        currency: "EUR",
        requestedById: "client-1",
        reviewedById: null,
        externalRefundId: null,
        createdAt: "2026-03-27T12:05:00.000Z",
        reviewedAt: null,
        completedAt: null,
      },
    ])

    const Page = (await import("@/app/[locale]/runner/orders/[id]/page")).default
    render(<Page />)

    expect(await screen.findByText("Ficha de entrega del runner")).toBeInTheDocument()
    expect(screen.getAllByText("Asignado").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Sesión lista").length).toBeGreaterThan(0)
    expect(screen.getByText("Revisar soporte visible")).toBeInTheDocument()
    expect(screen.getAllByText("En preparación").length).toBeGreaterThan(0)
    expect(screen.getAllByText("En revisión").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Resuelta").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Solicitada").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Aprobada").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Ejecutando").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Completada").length).toBeGreaterThan(0)
  })

  it("renders cancelled delivery states and the remaining pickup fallbacks", async () => {
    getOneMock.mockResolvedValueOnce(
      makeOrder({
        status: "CANCELLED",
        providerOrders: [
          { id: "provider-order-1", providerId: "provider-1", providerName: "", status: "DELIVERED", paymentStatus: "PAID", subtotal: 24, originalSubtotal: 24, discountAmount: 0, items: [{ id: "item-1", productId: "prod-1", quantity: 2, unitPrice: 12, baseUnitPrice: 12, appliedDiscountUnitPrice: null, discountAmount: 0 }] },
          { id: "provider-order-2", providerId: "provider-2", providerName: "Textil Sur", status: "CANCELLED", paymentStatus: "PAID", subtotal: 12, originalSubtotal: 12, discountAmount: 0, items: [{ id: "item-2", productId: "prod-2", quantity: 1, unitPrice: 12, baseUnitPrice: 12, appliedDiscountUnitPrice: null, discountAmount: 0 }] },
          { id: "provider-order-3", providerId: "provider-3", providerName: "Pan Sur", status: "REJECTED_BY_STORE", paymentStatus: "PAID", subtotal: 8, originalSubtotal: 8, discountAmount: 0, items: [{ id: "item-3", productId: "prod-3", quantity: 1, unitPrice: 8, baseUnitPrice: 8, appliedDiscountUnitPrice: null, discountAmount: 0 }] },
          { id: "provider-order-4", providerId: "provider-4", providerName: "Flor Oeste", status: "UNKNOWN_PICKUP" as never, paymentStatus: "PAID", subtotal: 6, originalSubtotal: 6, discountAmount: 0, items: [{ id: "item-4", productId: "prod-4", quantity: 1, unitPrice: 6, baseUnitPrice: 6, appliedDiscountUnitPrice: null, discountAmount: 0 }] },
        ],
        deliveryOrder: {
          id: "delivery-1",
          runnerId: "runner-1",
          status: "CANCELLED",
          paymentStatus: "FAILED",
        },
      }),
    )
    listDeliveryOrderIncidentsMock.mockResolvedValueOnce([])
    getDeliveryOrderRefundsMock.mockResolvedValueOnce([
      {
        id: "refund-1",
        incidentId: null,
        providerOrderId: null,
        deliveryOrderId: "delivery-1",
        type: "DELIVERY_PARTIAL",
        status: "REJECTED",
        amount: 2,
        currency: "EUR",
        requestedById: "client-1",
        reviewedById: null,
        externalRefundId: null,
        createdAt: "2026-03-27T12:05:00.000Z",
        reviewedAt: null,
        completedAt: null,
      },
    ])

    const Page = (await import("@/app/[locale]/runner/orders/[id]/page")).default
    render(<Page />)

    expect(await screen.findByText("Ficha de entrega del runner")).toBeInTheDocument()
    expect(screen.getAllByText("Cancelado").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Pago fallido").length).toBeGreaterThan(0)
    expect(screen.getByText("Revisar soporte visible")).toBeInTheDocument()
    expect(screen.getAllByText("Entregado").length).toBeGreaterThan(0)
    expect(screen.getByText("UNKNOWN_PICKUP")).toBeInTheDocument()
    expect(screen.getByText("provider-1")).toBeInTheDocument()
    expect(screen.getByText("Rechazada")).toBeInTheDocument()
  })
})
