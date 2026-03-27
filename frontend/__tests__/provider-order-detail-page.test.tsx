import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import type { Order } from "@/lib/types"

const mockUseParams = vi.fn()
const getAllMock = vi.fn()
const getProviderOrderRefundsMock = vi.fn()
const listDeliveryOrderIncidentsMock = vi.fn()
const useAuthMock = vi.fn()

vi.mock("next/navigation", () => ({
  useParams: () => mockUseParams(),
}))

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
    id: "root-order-1",
    userId: "client-1",
    total: 48,
    deliveryFee: 6,
    status: "IN_TRANSIT",
    createdAt: "2026-03-27T10:00:00.000Z",
    updatedAt: "2026-03-27T11:00:00.000Z",
    deliveryAddress: "Calle Feria 12",
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
            product: {
              id: "prod-1",
              name: "Cuenco artesanal",
              description: "desc",
              price: 12,
              stock: 5,
              city: "Sevilla",
              category: "Cerámica",
              providerId: "provider-1",
              createdAt: "2026-03-20T10:00:00.000Z",
            },
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

describe("ProviderOrderDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseParams.mockReturnValue({ providerOrderId: "provider-order-1" })
    useAuthMock.mockReturnValue({
      user: {
        userId: "provider-1",
        roles: ["PROVIDER"],
      },
    })
  })

  it("renders the provider order detail hub with finance and operations links", async () => {
    getAllMock.mockResolvedValueOnce([makeOrder()])
    getProviderOrderRefundsMock.mockResolvedValueOnce([
      {
        id: "refund-1",
        incidentId: null,
        providerOrderId: "provider-order-1",
        deliveryOrderId: null,
        type: "PROVIDER_PARTIAL",
        status: "UNDER_REVIEW",
        amount: 6,
        currency: "EUR",
        requestedById: "client-1",
        reviewedById: null,
        externalRefundId: null,
        createdAt: "2026-03-27T12:00:00.000Z",
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
        status: "UNDER_REVIEW",
        description: "La caja llegó dañada",
        evidenceUrl: null,
        createdAt: "2026-03-27T12:30:00.000Z",
        resolvedAt: null,
      },
    ])

    const Page = (await import("@/app/[locale]/provider/sales/[providerOrderId]/page")).default
    render(<Page />)

    expect(await screen.findByText("Ficha operativa del provider order")).toBeInTheDocument()
    expect(screen.getByText("Cuenco artesanal")).toBeInTheDocument()
    expect(screen.getAllByText("En revisión")).toHaveLength(2)
    expect(screen.getByText("La caja llegó dañada")).toBeInTheDocument()
    expect(screen.getByText("Incidencias visibles")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Abrir cobros y devoluciones/i })).toHaveAttribute(
      "href",
      "/provider/finance",
    )
    expect(screen.getAllByRole("link", { name: /Volver al panel operativo|Volver al kanban/i })).toHaveLength(2)
  })

  it("shows a safe error state when the provider order is missing from the provider scope", async () => {
    getAllMock.mockResolvedValueOnce([
      makeOrder({
        providerOrders: [
          {
            id: "provider-order-1",
            providerId: "provider-2",
            providerName: "Otro comercio",
            status: "PENDING",
            paymentStatus: "PAYMENT_PENDING",
            subtotal: 24,
            originalSubtotal: 24,
            discountAmount: 0,
            items: [],
          },
        ],
      }),
    ])

    const Page = (await import("@/app/[locale]/provider/sales/[providerOrderId]/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(
        screen.getByText("No encontramos este provider order en tu panel."),
      ).toBeInTheDocument()
    })
  })
})
