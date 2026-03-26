import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import type { Order } from "@/lib/types"

const getAllMock = vi.fn()
const useAuthMock = vi.fn()

vi.mock("@/lib/services/orders-service", () => ({
  ordersService: {
    getAll: (...args: unknown[]) => getAllMock(...args),
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

vi.mock("@/lib/navigation", () => ({
  Link: ({ href, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    asChild,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) =>
    asChild ? <>{children}</> : <button {...rest}>{children}</button>,
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
    items: [
      {
        id: "item-1",
        productId: "prod-1",
        quantity: 1,
        unitPrice: 12,
        baseUnitPrice: 12,
        appliedDiscountUnitPrice: null,
        discountAmount: 0,
        priceAtPurchase: 12,
        product: {
          id: "prod-1",
          name: "Cuenco artesanal",
          description: "desc",
          price: 12,
          stock: 5,
          city: "Madrid",
          category: "Cerámica",
          providerId: "provider-1",
          createdAt: "2026-03-20T10:00:00.000Z",
        },
      },
    ],
    providerOrders: [],
    ...overrides,
  }
}

describe("OrdersPage experience", () => {
  beforeEach(() => {
    getAllMock.mockReset()
    useAuthMock.mockReturnValue({
      user: {
        userId: "client-1",
        name: "Sofia Alva",
        roles: ["CLIENT"],
        mfaEnabled: true,
        hasPin: true,
      },
    })
  })

  it("shows an empty state with catalog recovery CTA", async () => {
    getAllMock.mockResolvedValueOnce([])

    const Page = (await import("@/app/[locale]/orders/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("Aún no tienes pedidos")).toBeInTheDocument()
    })

    expect(screen.getByRole("link", { name: "Explorar catálogo" })).toHaveAttribute(
      "href",
      "/products",
    )
  })

  it("separates pending orders from history and keeps payment and tracking entry points", async () => {
    getAllMock.mockResolvedValueOnce([
      makeOrder({
        id: "order-active",
        status: "IN_TRANSIT",
        total: 33,
      }),
      makeOrder({
        id: "order-past",
        status: "DELIVERED",
        total: 21,
        createdAt: "2026-03-20T10:00:00.000Z",
      }),
    ])

    const Page = (await import("@/app/[locale]/orders/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("Mis pedidos")).toBeInTheDocument()
    })

    expect(screen.getByText("Pedidos pendientes")).toBeInTheDocument()
    expect(screen.getAllByText("Histórico")).toHaveLength(2)
    expect(screen.getByRole("link", { name: /Seguir pedido/i })).toHaveAttribute(
      "href",
      "/orders/order-active/track",
    )
    expect(screen.getByRole("link", { name: /Gestionar pagos/i })).toHaveAttribute(
      "href",
      "/orders/order-active/payments",
    )
    expect(screen.getByRole("link", { name: /Ver pagos/i })).toHaveAttribute(
      "href",
      "/orders/order-past/payments",
    )
  })
})
