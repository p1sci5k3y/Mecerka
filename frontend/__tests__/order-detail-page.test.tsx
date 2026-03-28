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
    expect(screen.getByRole("link", { name: /Mi soporte/i })).toHaveAttribute(
      "href",
      "/profile/support",
    )
    expect(screen.getAllByText("Cerámica Norte")).toHaveLength(2)
    expect(screen.getByText("Cuenco artesanal")).toBeInTheDocument()
    expect(screen.getAllByText(/6,50/).length).toBeGreaterThan(0)
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

    expect(screen.queryByRole("link", { name: /Resolver pagos/i })).not.toBeInTheDocument()

    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it("falls back to opening seguimiento when there are no pending payments and delivery is not active", async () => {
    getOneMock.mockResolvedValueOnce(
      makeOrder({
        status: "CONFIRMED",
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
            items: [],
          },
        ],
        deliveryOrder: {
          id: "delivery-1",
          runnerId: "runner-1",
          status: "ASSIGNED",
          paymentStatus: "PAID",
        },
      }),
    )

    const Page = (await import("@/app/[locale]/orders/[id]/page")).default
    render(<Page />)

    expect(await screen.findByRole("link", { name: /Abrir seguimiento/i })).toHaveAttribute(
      "href",
      "/orders/order-1/track",
    )
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

  it("renders pending and fallback vocabulary across payment, delivery and product summaries", async () => {
    getOneMock.mockResolvedValueOnce(
      makeOrder({
        status: "PENDING",
        deliveryAddress: "",
        postalCode: "",
        deliveryOrder: undefined,
        items: [
          {
            id: "item-1",
            productId: "prod-raw",
            quantity: 1,
            unitPrice: 10,
            baseUnitPrice: 10,
            appliedDiscountUnitPrice: null,
            discountAmount: 0,
          },
        ],
        providerOrders: [
          {
            id: "provider-order-1",
            providerId: "provider-abcdef",
            providerName: "",
            status: "PICKED_UP",
            paymentStatus: "PAYMENT_READY",
            subtotal: 20,
            originalSubtotal: 25,
            discountAmount: 5,
            items: [],
          },
          {
            id: "provider-order-2",
            providerId: "provider-xyz",
            providerName: "",
            status: "CANCELLED",
            paymentStatus: "FAILED",
            subtotal: 8,
            originalSubtotal: 8,
            discountAmount: 0,
            items: [],
          },
        ],
      }),
    )

    const Page = (await import("@/app/[locale]/orders/[id]/page")).default
    render(<Page />)

    expect(await screen.findByText("Ficha del pedido")).toBeInTheDocument()
    expect(screen.getAllByText("Pendiente").length).toBeGreaterThan(0)
    expect(screen.getByText("Recogido · Sesión lista")).toBeInTheDocument()
    expect(screen.getByText("Cancelado · Fallido")).toBeInTheDocument()
    expect(screen.getAllByText(/Comercio provid/i).length).toBeGreaterThan(0)
    expect(screen.getByText("Producto prod-raw")).toBeInTheDocument()
    expect(screen.getByText("Comercio local · Ciudad no disponible")).toBeInTheDocument()
    expect(screen.getByText("Sin CP")).toBeInTheDocument()
    expect(screen.getByText("Sin reparto asignado")).toBeInTheDocument()
    expect(screen.getAllByText(/25,00/).length).toBeGreaterThan(0)
  })

  it("renders assignment and unknown fallback labels without crashing", async () => {
    getOneMock.mockResolvedValueOnce(
      makeOrder({
        status: "UNKNOWN_ROOT" as never,
        providerOrders: [
          {
            id: "provider-order-1",
            providerId: "provider-1",
            providerName: "Cerámica Norte",
            status: "ACCEPTED",
            paymentStatus: "PENDING",
            subtotal: 24,
            originalSubtotal: 24,
            discountAmount: 0,
            items: [],
          },
          {
            id: "provider-order-2",
            providerId: "provider-2",
            providerName: "Textil Sur",
            status: "UNKNOWN_STATUS" as never,
            paymentStatus: "UNKNOWN_PAYMENT",
            subtotal: 12,
            originalSubtotal: 12,
            discountAmount: 0,
            items: [],
          },
        ],
        deliveryOrder: {
          id: "delivery-1",
          runnerId: "runner-1",
          status: "ASSIGNED",
          paymentStatus: "PENDING",
        },
      }),
    )

    const Page = (await import("@/app/[locale]/orders/[id]/page")).default
    render(<Page />)

    expect(await screen.findByText("Ficha del pedido")).toBeInTheDocument()
    expect(screen.getByText("UNKNOWN_ROOT")).toBeInTheDocument()
    expect(screen.getByText("Aceptado · Pendiente")).toBeInTheDocument()
    expect(screen.getByText("UNKNOWN_STATUS · UNKNOWN_PAYMENT")).toBeInTheDocument()
    expect(screen.getByText("ASSIGNED")).toBeInTheDocument()
  })

  it("stops early when the route param is missing and preserves the loading shell semantics", async () => {
    mockUseParams.mockReturnValue({ id: undefined })

    const Page = (await import("@/app/[locale]/orders/[id]/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(getOneMock).not.toHaveBeenCalled()
    })

    expect(screen.queryByText("No pudimos cargar este pedido.")).not.toBeInTheDocument()
  })
})
