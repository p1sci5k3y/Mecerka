import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import type { Order } from "@/lib/types"

const mockUseParams = vi.fn()
const getOneMock = vi.fn()

vi.mock("next/navigation", () => ({
  useParams: () => mockUseParams(),
}))

vi.mock("@/lib/services/orders-service", () => ({
  ordersService: {
    getOne: (...args: unknown[]) => getOneMock(...args),
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
    deliveryFee: 5.5,
    status: "IN_TRANSIT",
    createdAt: "2026-03-27T10:00:00.000Z",
    updatedAt: "2026-03-27T11:00:00.000Z",
    city: "Sevilla",
    deliveryAddress: "Calle Feria 12",
    deliveryDistanceKm: 3.4,
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

describe("RunnerOrderDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseParams.mockReturnValue({ id: "order-1" })
  })

  it("renders the operational delivery hub with payout and route links", async () => {
    getOneMock.mockResolvedValueOnce(makeOrder())

    const Page = (await import("@/app/[locale]/runner/orders/[id]/page")).default
    render(<Page />)

    expect(await screen.findByText("Ficha de entrega del runner")).toBeInTheDocument()
    expect(screen.getByText("Cerámica Norte")).toBeInTheDocument()
    expect(screen.getByText("Calle Feria 12")).toBeInTheDocument()
    expect(screen.getAllByText("Pago pendiente")).toHaveLength(2)
    expect(screen.getByRole("link", { name: /Abrir cobros del runner/i })).toHaveAttribute(
      "href",
      "/runner/finance",
    )
  })

  it("shows a safe error state when the delivery cannot be loaded", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    getOneMock.mockRejectedValueOnce(new Error("boom"))

    const Page = (await import("@/app/[locale]/runner/orders/[id]/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("No pudimos cargar esta entrega.")).toBeInTheDocument()
    })

    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})
