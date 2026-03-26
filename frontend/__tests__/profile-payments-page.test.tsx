import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import type { Order } from "@/lib/types"

const getAllMock = vi.fn()
const getPublicRuntimeConfigMock = vi.fn()

vi.mock("@/lib/services/orders-service", () => ({
  ordersService: {
    getAll: (...args: unknown[]) => getAllMock(...args),
  },
}))

vi.mock("@/lib/runtime-config", () => ({
  getPublicRuntimeConfig: (...args: unknown[]) => getPublicRuntimeConfigMock(...args),
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
    providerOrders: [
      {
        id: "provider-order-1",
        providerId: "provider-1",
        providerName: "Cerámica Norte",
        status: "PREPARING",
        paymentStatus: "PAYMENT_PENDING",
        subtotal: 12,
        originalSubtotal: 12,
        discountAmount: 0,
        items: [],
      },
    ],
    deliveryOrder: null,
    ...overrides,
  }
}

describe("Profile payments page", () => {
  beforeEach(() => {
    getAllMock.mockReset()
    getPublicRuntimeConfigMock.mockReset()
  })

  it("explains that cards are not stored in profile and points to pending order payments", async () => {
    getAllMock.mockResolvedValueOnce([makeOrder({ id: "order-payable" })])
    getPublicRuntimeConfigMock.mockResolvedValueOnce({
      stripePublishableKey: "pk_test_realistic",
    })

    const Page = (await import("@/app/[locale]/profile/payments/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("Pagos y tarjetas")).toBeInTheDocument()
    })

    expect(
      screen.getByText(/no guarda todavía tarjetas del cliente en perfil/i),
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Gestionar pago/i })).toHaveAttribute(
      "href",
      "/orders/order-payable/payments",
    )
  })

  it("communicates demo mode when stripe is configured with a dummy public key", async () => {
    getAllMock.mockResolvedValueOnce([])
    getPublicRuntimeConfigMock.mockResolvedValueOnce({
      stripePublishableKey: "pk_test_mecerka_dummy_key",
    })

    const Page = (await import("@/app/[locale]/profile/payments/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(
        screen.getByText(/está en modo demo o sin clave pública real/i),
      ).toBeInTheDocument()
    })
  })
})
