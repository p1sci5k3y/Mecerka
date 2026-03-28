import { describe, expect, it, vi, beforeEach } from "vitest"
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

vi.mock("@/lib/navigation", () => ({
  Link: ({ href, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, asChild, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) =>
    asChild ? <>{children}</> : <button {...rest}>{children}</button>,
}))

function makeOrder(overrides: Partial<Order>): Order {
  return {
    id: "order-1",
    userId: "client-1",
    total: 0,
    deliveryFee: 5,
    status: "DELIVERED",
    createdAt: "2026-03-24T10:00:00.000Z",
    items: [],
    providerOrders: [],
    ...overrides,
  }
}

describe("ClientDashboard experience", () => {
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

  it("shows an empty-state CTA when the client has no orders", async () => {
    getAllMock.mockResolvedValueOnce([])

    const { ClientDashboard } = await import("@/app/[locale]/dashboard/client-dashboard")
    render(<ClientDashboard />)

    await waitFor(() => {
      expect(screen.getByText("Aún no tienes pedidos")).toBeInTheDocument()
    })

    expect(screen.getByRole("link", { name: "Explorar Catálogo" })).toHaveAttribute(
      "href",
      "/products",
    )
  })

  it("summarizes spend, supported artisans and the latest order", async () => {
    getAllMock.mockResolvedValueOnce([
      makeOrder({
        id: "order-active",
        status: "IN_TRANSIT",
        items: [
          {
            id: "item-1",
            productId: "prod-1",
            quantity: 2,
            unitPrice: 10,
            baseUnitPrice: 10,
            appliedDiscountUnitPrice: null,
            discountAmount: 0,
            priceAtPurchase: 10,
            product: {
              id: "prod-1",
              name: "Cuenco artesanal",
              description: "desc",
              price: 10,
              stock: 3,
              city: "Sevilla",
              category: "Cerámica",
              imageUrl: "/demo-products/tomatoes.jpg",
              providerId: "prov-1",
              createdAt: "2026-03-20T10:00:00.000Z",
            },
          },
        ],
      }),
      makeOrder({
        id: "order-past",
        status: "DELIVERED",
        items: [
          {
            id: "item-2",
            productId: "prod-2",
            quantity: 1,
            unitPrice: 30,
            baseUnitPrice: 30,
            appliedDiscountUnitPrice: null,
            discountAmount: 0,
            priceAtPurchase: 30,
            product: {
              id: "prod-2",
              name: "Bolso de cuero",
              description: "desc",
              price: 30,
              stock: 2,
              city: "Madrid",
              category: "Cuero",
              imageUrl: "/demo-products/olive-oil.jpg",
              providerId: "prov-2",
              createdAt: "2026-03-20T10:00:00.000Z",
            },
          },
        ],
      }),
    ])

    const { ClientDashboard } = await import("@/app/[locale]/dashboard/client-dashboard")
    render(<ClientDashboard />)

    await waitFor(() => {
      expect(screen.getByText(/Cuaderno de Pedidos - Sofia/i)).toBeInTheDocument()
    })

    expect(screen.getByText("€30.00")).toBeInTheDocument()
    expect(screen.getByText("2")).toBeInTheDocument()
    expect(screen.getByText("1")).toBeInTheDocument()
    expect(screen.getByText(/Cuenco artesanal/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Historial Completo/i })).toHaveAttribute(
      "href",
      "/orders",
    )
    expect(
      screen.getByText("Recibo completo no disponible en esta vista"),
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Seguir Envío/i })).toHaveAttribute(
      "href",
      "/orders/order-active/track",
    )
    expect(
      document.querySelector("[style*='/demo-products/tomatoes.jpg']"),
    ).toBeInTheDocument()
  })
})
