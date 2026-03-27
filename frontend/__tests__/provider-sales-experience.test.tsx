import { describe, expect, it, vi, beforeEach } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { Order, ProviderOrder } from "@/lib/types"

const getAllMock = vi.fn()
const useAuthMock = vi.fn()
const updateProviderOrderStatusMock = vi.fn()
const toastSuccessMock = vi.fn()
const toastErrorMock = vi.fn()

vi.mock("@/lib/services/orders-service", () => ({
  ordersService: {
    getAll: (...args: unknown[]) => getAllMock(...args),
    updateProviderOrderStatus: (...args: unknown[]) => updateProviderOrderStatusMock(...args),
  },
}))

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => useAuthMock(),
}))

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    error: (...args: unknown[]) => toastErrorMock(...args),
    success: (...args: unknown[]) => toastSuccessMock(...args),
  }),
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

vi.mock("@/components/protected-route", () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock("@/hooks/use-now", () => ({
  useNow: () => new Date("2026-03-24T12:00:00.000Z"),
}))

vi.mock("@/components/provider/OrderKanbanColumn", () => ({
  OrderKanbanColumn: ({
    title,
    providerId,
    validStatuses,
    orders,
    onStatusChange,
    onReject,
  }: {
    title: string
    providerId: string
    validStatuses: string[]
    orders: Order[]
    onStatusChange: (providerOrderId: string, currentStatus: string, nextStatus: string) => void
    onReject: (providerOrderId: string) => void
  }) => {
    const visibleProviderOrders = orders.flatMap((order) =>
      (order.providerOrders ?? []).filter(
        (po) => po.providerId === providerId && validStatuses.includes(po.status),
      ),
    )

    return (
      <div data-testid={`kanban-${title}`}>
        {title}:{visibleProviderOrders.length}
        {visibleProviderOrders[0] ? (
          <>
            <button
              type="button"
              onClick={() =>
                onStatusChange(
                  visibleProviderOrders[0].id,
                  visibleProviderOrders[0].status,
                  "PREPARING",
                )
              }
            >
              advance-{title}
            </button>
            <button type="button" onClick={() => onReject(visibleProviderOrders[0].id)}>
              reject-{title}
            </button>
          </>
        ) : null}
      </div>
    )
  },
}))

function makeProviderOrder(
  providerId: string,
  status: ProviderOrder["status"],
  subtotal: number,
  createdAt = "2026-03-24T09:00:00.000Z",
): ProviderOrder {
  return {
    id: `${providerId}-${status}`,
    providerId,
    status,
    paymentStatus: "UNPAID",
    subtotal,
    originalSubtotal: subtotal,
    discountAmount: 0,
    createdAt,
    items: [],
  }
}

function makeOrder(overrides: Partial<Order>): Order {
  return {
    id: "order-1",
    userId: "client-1",
    total: 0,
    deliveryFee: 5,
    status: "CONFIRMED",
    createdAt: "2026-03-24T10:00:00.000Z",
    items: [],
    providerOrders: [],
    ...overrides,
  }
}

describe("Provider sales experience", () => {
  beforeEach(() => {
    getAllMock.mockReset()
    updateProviderOrderStatusMock.mockReset()
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
    useAuthMock.mockReturnValue({
      user: {
        userId: "provider-1",
        name: "Taller Sevilla",
        roles: ["PROVIDER"],
        mfaEnabled: true,
        hasPin: true,
      },
    })
  })

  it("summarizes the provider day and distributes orders across kanban states", async () => {
    getAllMock.mockResolvedValueOnce([
      makeOrder({
        id: "order-pending",
        providerOrders: [makeProviderOrder("provider-1", "PENDING", 30)],
      }),
      makeOrder({
        id: "order-preparing",
        providerOrders: [makeProviderOrder("provider-1", "PREPARING", 45)],
      }),
      makeOrder({
        id: "order-ready",
        providerOrders: [makeProviderOrder("provider-1", "READY_FOR_PICKUP", 15)],
      }),
      makeOrder({
        id: "order-other-provider",
        providerOrders: [makeProviderOrder("provider-2", "PENDING", 999)],
      }),
    ])

    const Page = (await import("@/app/[locale]/provider/sales/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("Panel Operativo")).toBeInTheDocument()
    })

    expect(screen.getByText(/Hola, Taller Sevilla/)).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: /Cobros y devoluciones/i }),
    ).toHaveAttribute("href", "/provider/finance")
    expect(screen.getByText("3")).toBeInTheDocument()
    expect(screen.getByText("1")).toBeInTheDocument()
    expect(screen.getByText("90.00 €")).toBeInTheDocument()
    expect(screen.getByTestId("kanban-Nuevos")).toHaveTextContent("Nuevos:1")
    expect(screen.getByTestId("kanban-En Preparación")).toHaveTextContent(
      "En Preparación:1",
    )
    expect(screen.getByTestId("kanban-Listos")).toHaveTextContent("Listos:1")
  })

  it("updates provider-order status, handles conflicts and allows rejecting an order", async () => {
    getAllMock.mockResolvedValue([
      makeOrder({
        id: "order-pending",
        providerOrders: [makeProviderOrder("provider-1", "PENDING", 30)],
      }),
    ])
    updateProviderOrderStatusMock
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce({ response: { status: 409 } })
      .mockResolvedValueOnce({})

    const Page = (await import("@/app/[locale]/provider/sales/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByTestId("kanban-Nuevos")).toHaveTextContent("Nuevos:1")
    })

    fireEvent.click(screen.getByRole("button", { name: "advance-Nuevos" }))
    await waitFor(() => {
      expect(updateProviderOrderStatusMock).toHaveBeenCalledWith(
        "provider-1-PENDING",
        "PREPARING",
      )
      expect(toastSuccessMock).toHaveBeenCalledWith("Pedido actualizado correctamente")
    })

    fireEvent.click(screen.getByRole("button", { name: "advance-Nuevos" }))
    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "El estado del pedido cambió hace unos segundos. Reiniciando vista...",
      )
    })

    fireEvent.click(screen.getByRole("button", { name: "reject-Nuevos" }))
    await waitFor(() => {
      expect(updateProviderOrderStatusMock).toHaveBeenCalledWith(
        "provider-1-PENDING",
        "REJECTED_BY_STORE",
      )
    })
  })
})
