import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import type { Order } from "@/lib/types"

const getAllMock = vi.fn()
const getProviderOrderRefundsMock = vi.fn()
const listDeliveryOrderIncidentsMock = vi.fn()
const useAuthMock = vi.fn()

vi.mock("@/lib/services/orders-service", () => ({
  ordersService: {
    getAll: (...args: unknown[]) => getAllMock(...args),
  },
}))

vi.mock("@/lib/services/refunds-service", () => ({
  refundsService: {
    getProviderOrderRefunds: (...args: unknown[]) => getProviderOrderRefundsMock(...args),
  },
}))

vi.mock("@/lib/services/delivery-incidents-service", () => ({
  deliveryIncidentsService: {
    listDeliveryOrderIncidents: (...args: unknown[]) => listDeliveryOrderIncidentsMock(...args),
  },
}))

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => useAuthMock(),
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

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    userId: "client-1",
    total: 42,
    deliveryFee: 5,
    status: "CONFIRMED",
    createdAt: "2026-03-24T10:00:00.000Z",
    updatedAt: "2026-03-24T11:00:00.000Z",
    items: [],
    deliveryOrder: {
      id: "delivery-1",
      runnerId: "runner-1",
      status: "ASSIGNED",
      paymentStatus: "PAYMENT_PENDING",
    },
    providerOrders: [
      {
        id: "provider-order-1",
        providerId: "provider-1",
        providerName: "Cerámica Norte",
        status: "READY_FOR_PICKUP",
        paymentStatus: "PAID",
        subtotal: 18,
        originalSubtotal: 18,
        discountAmount: 0,
        items: [
          {
            id: "item-1",
            productId: "prod-1",
            quantity: 1,
            unitPrice: 18,
            baseUnitPrice: 18,
            appliedDiscountUnitPrice: null,
            discountAmount: 0,
            priceAtPurchase: 18,
            product: {
              id: "prod-1",
              name: "Cuenco artesanal",
              description: "desc",
              price: 18,
              stock: 3,
              city: "Sevilla",
              category: "Cerámica",
              providerId: "provider-1",
              createdAt: "2026-03-20T10:00:00.000Z",
            },
          },
        ],
      },
    ],
    ...overrides,
  }
}

describe("Provider support page", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthMock.mockReturnValue({
      user: {
        userId: "provider-1",
        roles: ["PROVIDER"],
      },
    })
  })

  it("lists provider orders with visible incidents and refunds", async () => {
    getAllMock.mockResolvedValueOnce([makeOrder()])
    getProviderOrderRefundsMock.mockResolvedValueOnce([
      {
        id: "refund-1",
        providerOrderId: "provider-order-1",
        deliveryOrderId: null,
        incidentId: "incident-1",
        type: "PROVIDER_PARTIAL",
        status: "UNDER_REVIEW",
        amount: 3,
        currency: "EUR",
        requestedById: "client-1",
        reviewedById: null,
        externalRefundId: null,
        createdAt: "2026-03-26T10:00:00.000Z",
        reviewedAt: null,
        completedAt: null,
      },
    ])
    listDeliveryOrderIncidentsMock.mockResolvedValueOnce([
      {
        id: "incident-1",
        deliveryOrderId: "delivery-1",
        reporterRole: "CLIENT",
        type: "DAMAGED_ITEMS",
        status: "OPEN",
        description: "Caja dañada",
        evidenceUrl: null,
        createdAt: "2026-03-26T11:00:00.000Z",
        resolvedAt: null,
      },
    ])

    const Page = (await import("@/app/[locale]/provider/support/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("Centro de soporte del comercio")).toBeInTheDocument()
    })

    expect(screen.getByText("Provider orders con soporte")).toBeInTheDocument()
    expect(screen.getByText("Cuenco artesanal")).toBeInTheDocument()
    expect(screen.getByText("PROVIDER_PARTIAL · En revisión")).toBeInTheDocument()
    expect(screen.getByText("DAMAGED_ITEMS · Abierta")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Ver ficha operativa/i })).toHaveAttribute(
      "href",
      "/provider/sales/provider-order-1",
    )
  })

  it("shows an empty state when there are no visible cases for the provider", async () => {
    getAllMock.mockResolvedValueOnce([makeOrder()])
    getProviderOrderRefundsMock.mockResolvedValueOnce([])
    listDeliveryOrderIncidentsMock.mockResolvedValueOnce([])

    const Page = (await import("@/app/[locale]/provider/support/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("Centro de soporte del comercio")).toBeInTheDocument()
    })

    expect(
      screen.getByText(/No hay incidencias ni devoluciones visibles para tu comercio ahora mismo/i),
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Abrir finanzas/i })).toHaveAttribute(
      "href",
      "/provider/finance",
    )
  })
})
