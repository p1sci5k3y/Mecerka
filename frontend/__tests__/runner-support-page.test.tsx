import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { Order } from "@/lib/types"

const getAllMock = vi.fn()
const listDeliveryOrderIncidentsMock = vi.fn()
const getDeliveryOrderRefundsMock = vi.fn()
const createIncidentMock = vi.fn()
const toastMock = vi.fn()

vi.mock("@/lib/services/orders-service", () => ({
  ordersService: {
    getAll: (...args: unknown[]) => getAllMock(...args),
  },
}))

vi.mock("@/lib/services/delivery-incidents-service", () => ({
  deliveryIncidentsService: {
    listDeliveryOrderIncidents: (...args: unknown[]) => listDeliveryOrderIncidentsMock(...args),
    createIncident: (...args: unknown[]) => createIncidentMock(...args),
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

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({
    toast: (...args: unknown[]) => toastMock(...args),
  }),
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

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    userId: "client-1",
    total: 48,
    deliveryFee: 4.5,
    status: "DELIVERED",
    createdAt: "2026-03-24T10:00:00.000Z",
    updatedAt: "2026-03-24T11:00:00.000Z",
    items: [],
    providerOrders: [],
    deliveryOrder: {
      id: "delivery-1",
      runnerId: "runner-1",
      status: "DELIVERED",
      paymentStatus: "PAID",
    },
    ...overrides,
  }
}

describe("Runner support page", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("lists runner deliveries with visible incidents and refunds", async () => {
    getAllMock.mockResolvedValueOnce([makeOrder()])
    listDeliveryOrderIncidentsMock.mockResolvedValueOnce([
      {
        id: "incident-1",
        deliveryOrderId: "delivery-1",
        reporterRole: "CLIENT",
        type: "FAILED_DELIVERY",
        status: "UNDER_REVIEW",
        description: "Entrega retrasada",
        evidenceUrl: null,
        createdAt: "2026-03-24T12:00:00.000Z",
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
        status: "REQUESTED",
        amount: 2,
        currency: "EUR",
        requestedById: "client-1",
        reviewedById: null,
        externalRefundId: null,
        createdAt: "2026-03-24T12:10:00.000Z",
        reviewedAt: null,
        completedAt: null,
      },
    ])

    const Page = (await import("@/app/[locale]/runner/support/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("Centro de soporte del runner")).toBeInTheDocument()
    })

    expect(screen.getByText("Entregas con soporte")).toBeInTheDocument()
    expect(screen.getAllByText("Pedido #ORDER-1").length).toBeGreaterThan(0)
    expect(screen.getByText("DELIVERY_PARTIAL · Solicitada")).toBeInTheDocument()
    expect(screen.getByText("FAILED_DELIVERY · En revisión")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Ver ficha operativa/i })).toHaveAttribute(
      "href",
      "/runner/orders/order-1",
    )
  })

  it("shows an empty state when there are no visible support cases for the runner", async () => {
    getAllMock.mockResolvedValueOnce([makeOrder()])
    listDeliveryOrderIncidentsMock.mockResolvedValueOnce([])
    getDeliveryOrderRefundsMock.mockResolvedValueOnce([])

    const Page = (await import("@/app/[locale]/runner/support/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("Centro de soporte del runner")).toBeInTheDocument()
    })

    expect(
      screen.getByText(/No hay incidencias ni devoluciones visibles en tus entregas ahora mismo/i),
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Abrir finanzas/i })).toHaveAttribute(
      "href",
      "/runner/finance",
    )
  })

  it("lets the runner open an incident from the support hub", async () => {
    getAllMock.mockResolvedValue([makeOrder()])
    listDeliveryOrderIncidentsMock.mockResolvedValue([])
    getDeliveryOrderRefundsMock.mockResolvedValue([])
    createIncidentMock.mockResolvedValue({
      id: "incident-new",
      deliveryOrderId: "delivery-1",
      reporterRole: "RUNNER",
      type: "FAILED_DELIVERY",
      status: "OPEN",
      description: "Cliente ausente en la entrega",
      evidenceUrl: null,
      createdAt: "2026-03-27T12:00:00.000Z",
      resolvedAt: null,
    })

    const Page = (await import("@/app/[locale]/runner/support/page")).default
    render(<Page />)

    await screen.findByText("Abrir incidencia operativa")

    fireEvent.change(
      screen.getByPlaceholderText(/Describe la incidencia detectada en la entrega/i),
      { target: { value: "Cliente ausente en la entrega" } },
    )
    fireEvent.click(screen.getByRole("button", { name: /Registrar incidencia/i }))

    await waitFor(() => {
      expect(createIncidentMock).toHaveBeenCalledWith({
        deliveryOrderId: "delivery-1",
        type: "FAILED_DELIVERY",
        description: "Cliente ausente en la entrega",
      })
    })
    expect(toastMock).toHaveBeenCalled()
  })
})
