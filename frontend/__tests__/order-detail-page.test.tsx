import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { Order } from "@/lib/types"

const mockUseParams = vi.fn()
const routerPushMock = vi.fn()
const routerReplaceMock = vi.fn()
const getOneMock = vi.fn()
const useAuthMock = vi.fn()

vi.mock("next/navigation", () => ({
  useParams: () => mockUseParams(),
}))

vi.mock("@/lib/navigation", () => ({
  useRouter: () => ({
    push: routerPushMock,
    replace: routerReplaceMock,
  }),
  usePathname: () => "/orders/order-1",
  Link: ({ href, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock("@/lib/services/orders-service", () => ({
  ordersService: {
    getOne: (...args: unknown[]) => getOneMock(...args),
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

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    userId: "client-1",
    total: 42.5,
    deliveryFee: 6.5,
    status: "IN_TRANSIT",
    createdAt: "2026-03-27T10:00:00.000Z",
    updatedAt: "2026-03-27T11:00:00.000Z",
    deliveryAddress: "Calle Feria 12",
    postalCode: "41003",
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
          provider: { name: "Cerámica Norte" },
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

describe("OrderDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseParams.mockReturnValue({ id: "order-1" })
    useAuthMock.mockReturnValue({
      user: { roles: ["CLIENT"] },
      isAuthenticated: true,
      isLoading: false,
    })
  })

  it("renders the order detail hub with central actions", async () => {
    getOneMock.mockResolvedValueOnce(makeOrder())

    const Page = (await import("@/app/[locale]/orders/[id]/page")).default
    render(<Page />)

    expect(await screen.findByText("Ficha del pedido")).toBeInTheDocument()
    expect(getOneMock).toHaveBeenCalledWith("order-1")
    expect(screen.getByText("Estado actual")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Resolver pagos/i })).toHaveAttribute(
      "href",
      "/orders/order-1/payments",
    )
    expect(screen.getByRole("link", { name: /Seguir pedido/i })).toHaveAttribute(
      "href",
      "/orders/order-1/track",
    )
    expect(screen.getAllByText("Cerámica Norte")).toHaveLength(2)
    expect(screen.getByText("Cuenco artesanal")).toBeInTheDocument()
  })

  it("falls back to view payments when the order is economically covered", async () => {
    getOneMock.mockResolvedValueOnce(
      makeOrder({
        status: "DELIVERED",
        providerOrders: [
          {
            id: "provider-order-1",
            providerId: "provider-1",
            providerName: "Cerámica Norte",
            status: "DELIVERED",
            paymentStatus: "PAID",
            subtotal: 24,
            originalSubtotal: 24,
            discountAmount: 0,
            items: [],
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

    const Page = (await import("@/app/[locale]/orders/[id]/page")).default
    render(<Page />)

    expect(await screen.findByRole("link", { name: /Ver pagos/i })).toHaveAttribute(
      "href",
      "/orders/order-1/payments",
    )
  })

  it("lets the user go back to the orders hub", async () => {
    getOneMock.mockResolvedValueOnce(makeOrder())

    const Page = (await import("@/app/[locale]/orders/[id]/page")).default
    render(<Page />)

    expect(await screen.findByText("Ficha del pedido")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Volver a mis pedidos/i }))
    expect(routerPushMock).toHaveBeenCalledWith("/orders")
  })

  it("shows a safe error state when the order cannot be loaded", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    getOneMock.mockRejectedValueOnce(new Error("boom"))

    const Page = (await import("@/app/[locale]/orders/[id]/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("No pudimos cargar este pedido.")).toBeInTheDocument()
    })

    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it("redirects unauthenticated users to login with returnTo", async () => {
    useAuthMock.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    })

    const Page = (await import("@/app/[locale]/orders/[id]/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(routerReplaceMock).toHaveBeenCalledWith(
        "/login?returnTo=%2Forders%2Forder-1",
      )
    })
  })

  it("redirects non-client users to dashboard and renders additional status vocabulary", async () => {
    useAuthMock.mockReturnValue({
      user: { roles: ["PROVIDER"] },
      isAuthenticated: true,
      isLoading: false,
    })
    getOneMock.mockResolvedValueOnce(
      makeOrder({
        status: "READY_FOR_ASSIGNMENT",
        providerOrders: [
          {
            id: "provider-order-1",
            providerId: "provider-1",
            providerName: "Cerámica Norte",
            status: "REJECTED_BY_STORE",
            paymentStatus: "FAILED",
            subtotal: 24,
            originalSubtotal: 24,
            discountAmount: 0,
            items: [],
          },
        ],
      }),
    )

    const Page = (await import("@/app/[locale]/orders/[id]/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(routerReplaceMock).toHaveBeenCalledWith("/dashboard")
    })
  })
})
