import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

const mockUseParams = vi.fn()
const mockUseAuth = vi.fn()
const mapPropsSpy = vi.fn()
const getOneMock = vi.fn()
const listDeliveryOrderIncidentsMock = vi.fn()
const createIncidentMock = vi.fn()
const getProviderOrderRefundsMock = vi.fn()
const getDeliveryOrderRefundsMock = vi.fn()
const requestRefundMock = vi.fn()
const toastMock = vi.fn()

vi.mock("next/navigation", () => ({
  useParams: () => mockUseParams(),
}))

vi.mock("next/dynamic", () => ({
  default: () => (props: unknown) => {
    mapPropsSpy(props)
    return <div data-testid="dynamic-delivery-map" />
  },
}))

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => mockUseAuth(),
}))

vi.mock("@/components/navbar", () => ({
  Navbar: () => <nav data-testid="navbar" />,
}))

vi.mock("@/components/protected-route", () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="protected-route">{children}</div>
  ),
}))

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}))

vi.mock("@/lib/services/orders-service", () => ({
  ordersService: {
    getOne: (...args: unknown[]) => getOneMock(...args),
  },
}))

vi.mock("@/lib/services/delivery-incidents-service", () => ({
  deliveryIncidentsService: {
    listDeliveryOrderIncidents: (...args: unknown[]) =>
      listDeliveryOrderIncidentsMock(...args),
    createIncident: (...args: unknown[]) => createIncidentMock(...args),
  },
}))

vi.mock("@/lib/services/refunds-service", () => ({
  refundsService: {
    getProviderOrderRefunds: (...args: unknown[]) =>
      getProviderOrderRefundsMock(...args),
    getDeliveryOrderRefunds: (...args: unknown[]) =>
      getDeliveryOrderRefundsMock(...args),
    requestRefund: (...args: unknown[]) => requestRefundMock(...args),
  },
}))

function makeOrder() {
  return {
    id: "577731b8-f2e9-4a16-8594-981b5dff09b2",
    deliveryFee: 4.5,
    providerOrders: [
      {
        id: "provider-order-1",
        providerId: "provider-1",
        providerName: "Ceramica Norte",
        subtotal: 18.5,
      },
    ],
    deliveryOrder: {
      id: "delivery-order-1",
    },
  }
}

describe("TrackOrderPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseParams.mockReturnValue({ id: "577731b8-f2e9-4a16-8594-981b5dff09b2" })
    getOneMock.mockResolvedValue(makeOrder())
    listDeliveryOrderIncidentsMock.mockResolvedValue([])
    createIncidentMock.mockResolvedValue({
      id: "incident-created",
      deliveryOrderId: "delivery-order-1",
      reporterRole: "CLIENT",
      type: "MISSING_ITEMS",
      status: "OPEN",
      description: "Faltan artículos",
      evidenceUrl: null,
      createdAt: "2026-03-27T12:00:00.000Z",
      resolvedAt: null,
    })
    getProviderOrderRefundsMock.mockResolvedValue([])
    getDeliveryOrderRefundsMock.mockResolvedValue([])
    requestRefundMock.mockResolvedValue({
      id: "refund-created",
      providerOrderId: "provider-order-1",
      deliveryOrderId: null,
      type: "PROVIDER_PARTIAL",
      status: "REQUESTED",
      amount: 10,
      currency: "EUR",
      requestedById: "client-1",
      reviewedById: null,
      externalRefundId: null,
      createdAt: "2026-03-27T12:00:00.000Z",
      reviewedAt: null,
      completedAt: null,
    })
  })

  it("passes runner mode when the authenticated user is a runner", async () => {
    mockUseAuth.mockReturnValue({
      user: { roles: ["RUNNER"] },
    })

    const TrackOrderPage = (await import("@/app/[locale]/orders/[id]/track/page")).default
    render(<TrackOrderPage />)

    expect(
      screen.getByText(
        "Seguimiento del Pedido #577731b8-f2e9-4a16-8594-981b5dff09b2",
      ),
    ).toBeInTheDocument()
    expect(screen.getByTestId("dynamic-delivery-map")).toBeInTheDocument()
    expect(screen.queryByText("Centro de soporte del pedido")).not.toBeInTheDocument()
    expect(getOneMock).not.toHaveBeenCalled()
    expect(mapPropsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "577731b8-f2e9-4a16-8594-981b5dff09b2",
        isRunner: true,
        initialLat: 40.4168,
        initialLng: -3.7038,
      }),
    )
  })

  it("loads the client support center with incidents and refunds", async () => {
    mockUseAuth.mockReturnValue({
      user: { roles: ["CLIENT"] },
    })
    listDeliveryOrderIncidentsMock.mockResolvedValueOnce([
      {
        id: "incident-1",
        deliveryOrderId: "delivery-order-1",
        reporterRole: "CLIENT",
        type: "MISSING_ITEMS",
        status: "OPEN",
        description: "Falta un producto",
        evidenceUrl: null,
        createdAt: "2026-03-27T11:00:00.000Z",
        resolvedAt: null,
      },
    ])
    getProviderOrderRefundsMock.mockResolvedValueOnce([
      {
        id: "refund-1",
        providerOrderId: "provider-order-1",
        deliveryOrderId: null,
        type: "PROVIDER_PARTIAL",
        status: "UNDER_REVIEW",
        amount: 7.5,
        currency: "EUR",
        requestedById: "client-1",
        reviewedById: null,
        externalRefundId: null,
        createdAt: "2026-03-27T10:00:00.000Z",
        reviewedAt: null,
        completedAt: null,
      },
    ])
    getDeliveryOrderRefundsMock.mockResolvedValueOnce([
      {
        id: "refund-2",
        providerOrderId: null,
        deliveryOrderId: "delivery-order-1",
        type: "DELIVERY_PARTIAL",
        status: "REQUESTED",
        amount: 4.5,
        currency: "EUR",
        requestedById: "client-1",
        reviewedById: null,
        externalRefundId: null,
        createdAt: "2026-03-27T09:00:00.000Z",
        reviewedAt: null,
        completedAt: null,
      },
    ])

    const TrackOrderPage = (await import("@/app/[locale]/orders/[id]/track/page")).default
    render(<TrackOrderPage />)

    expect(await screen.findByText("Centro de soporte del pedido")).toBeInTheDocument()
    await waitFor(() => {
      expect(getOneMock).toHaveBeenCalledWith("577731b8-f2e9-4a16-8594-981b5dff09b2")
    })
    expect(listDeliveryOrderIncidentsMock).toHaveBeenCalledWith("delivery-order-1")
    expect(getProviderOrderRefundsMock).toHaveBeenCalledWith("provider-order-1")
    expect(getDeliveryOrderRefundsMock).toHaveBeenCalledWith("delivery-order-1")
    expect(await screen.findByText("Falta un producto")).toBeInTheDocument()
    expect(screen.getByText(/En revisión/i)).toBeInTheDocument()
    expect(screen.getByText("2 solicitudes")).toBeInTheDocument()
    expect(mapPropsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "577731b8-f2e9-4a16-8594-981b5dff09b2",
        isRunner: false,
      }),
    )
  })

  it("submits new delivery incidents from the client support center", async () => {
    mockUseAuth.mockReturnValue({
      user: { roles: ["CLIENT"] },
    })
    listDeliveryOrderIncidentsMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "incident-created",
          deliveryOrderId: "delivery-order-1",
          reporterRole: "CLIENT",
          type: "MISSING_ITEMS",
          status: "OPEN",
          description: "Faltan dos productos",
          evidenceUrl: null,
          createdAt: "2026-03-27T12:00:00.000Z",
          resolvedAt: null,
        },
      ])

    const TrackOrderPage = (await import("@/app/[locale]/orders/[id]/track/page")).default
    render(<TrackOrderPage />)

    expect(await screen.findByText("Centro de soporte del pedido")).toBeInTheDocument()
    expect(await screen.findByRole("button", { name: "Registrar incidencia" })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("Descripción"), {
      target: { value: "Faltan dos productos en el pedido" },
    })
    fireEvent.change(screen.getByPlaceholderText("https://..."), {
      target: { value: "https://example.com/evidence.jpg" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Registrar incidencia" }))

    await waitFor(() => {
      expect(createIncidentMock).toHaveBeenCalledWith({
        deliveryOrderId: "delivery-order-1",
        type: "MISSING_ITEMS",
        description: "Faltan dos productos en el pedido",
        evidenceUrl: "https://example.com/evidence.jpg",
      })
    })
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Incidencia registrada",
      }),
    )
    expect(await screen.findByText("Faltan dos productos")).toBeInTheDocument()
  })

  it("submits refund requests tied to the selected target", async () => {
    mockUseAuth.mockReturnValue({
      user: { roles: ["CLIENT"] },
    })
    getProviderOrderRefundsMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "refund-created",
          providerOrderId: "provider-order-1",
          deliveryOrderId: null,
          type: "PROVIDER_PARTIAL",
          status: "REQUESTED",
          amount: 8.25,
          currency: "EUR",
          requestedById: "client-1",
          reviewedById: null,
          externalRefundId: null,
          createdAt: "2026-03-27T12:00:00.000Z",
          reviewedAt: null,
          completedAt: null,
        },
      ])

    const TrackOrderPage = (await import("@/app/[locale]/orders/[id]/track/page")).default
    render(<TrackOrderPage />)

    expect(await screen.findByRole("button", { name: "Solicitar devolución" })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("Importe"), {
      target: { value: "8.25" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Solicitar devolución" }))

    await waitFor(() => {
      expect(requestRefundMock).toHaveBeenCalledWith({
        providerOrderId: "provider-order-1",
        type: "PROVIDER_PARTIAL",
        amount: 8.25,
        currency: "EUR",
      })
    })
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Solicitud de devolución registrada",
      }),
    )
    expect(await screen.findByText("1 solicitudes")).toBeInTheDocument()
  })
})
