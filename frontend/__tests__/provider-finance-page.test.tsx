import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import type { Order } from "@/lib/types"

const getAllMock = vi.fn()
const getProviderOrderRefundsMock = vi.fn()
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

vi.mock("@/lib/runtime-config", () => ({
  getApiBaseUrl: () => "https://api.mecerka.test",
}))

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
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

describe("Provider finance page", () => {
  beforeEach(() => {
    getAllMock.mockReset()
    getProviderOrderRefundsMock.mockReset()
    useAuthMock.mockReturnValue({
      user: {
        userId: "provider-1",
        name: "Taller Sevilla",
        roles: ["PROVIDER"],
        stripeAccountId: "acct_provider_123",
        mfaEnabled: true,
        hasPin: true,
      },
    })
  })

  it("shows paid provider orders and visible refunds without pretending the provider executes them", async () => {
    getAllMock.mockResolvedValueOnce([makeOrder()])
    getProviderOrderRefundsMock.mockResolvedValueOnce([
      {
        id: "refund-1",
        providerOrderId: "provider-order-1",
        deliveryOrderId: null,
        type: "PROVIDER_PARTIAL",
        status: "UNDER_REVIEW",
        amount: 6,
        currency: "EUR",
        requestedById: "client-1",
        reviewedById: null,
        externalRefundId: null,
        createdAt: "2026-03-26T10:00:00.000Z",
        reviewedAt: null,
        completedAt: null,
      },
    ])

    const Page = (await import("@/app/[locale]/provider/finance/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("Cobros y devoluciones")).toBeInTheDocument()
    })

    expect(screen.getAllByText("Provider orders cobrados")).toHaveLength(2)
    expect(screen.getByText("Potencialmente reembolsables")).toBeInTheDocument()
    expect(screen.getAllByText("Devoluciones visibles")).toHaveLength(2)
    expect(screen.getByText(/Tu cuenta está conectada/i)).toBeInTheDocument()
    expect(screen.getAllByText("Cuenco artesanal")).toHaveLength(2)
    expect(screen.getByText(/Estado:\s*UNDER_REVIEW\s*· Tipo:\s*PROVIDER_PARTIAL/i)).toBeInTheDocument()
    expect(
      screen.getByText(/La revisión y ejecución siguen siendo flujos de backoffice\/admin/i),
    ).toBeInTheDocument()
  })

  it("shows the stripe connect CTA when the provider is not connected yet", async () => {
    useAuthMock.mockReturnValue({
      user: {
        userId: "provider-1",
        name: "Taller Sevilla",
        roles: ["PROVIDER"],
        stripeAccountId: null,
        mfaEnabled: true,
        hasPin: true,
      },
    })
    getAllMock.mockResolvedValueOnce([])

    const Page = (await import("@/app/[locale]/provider/finance/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("Cobros y devoluciones")).toBeInTheDocument()
    })

    expect(screen.getByRole("button", { name: /Conectar con Stripe/i })).toBeInTheDocument()
  })
})
