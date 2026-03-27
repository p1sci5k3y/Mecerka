import { describe, expect, it, vi, beforeEach } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { Order } from "@/lib/types"

const getAvailableMock = vi.fn()
const getAllMock = vi.fn()
const toastErrorMock = vi.fn()
const toastSuccessMock = vi.fn()
const acceptMock = vi.fn()
const markInTransitMock = vi.fn()
const completeMock = vi.fn()

vi.mock("@/lib/services/orders-service", () => ({
  ordersService: {
    getAvailable: (...args: unknown[]) => getAvailableMock(...args),
    getAll: (...args: unknown[]) => getAllMock(...args),
    accept: (...args: unknown[]) => acceptMock(...args),
    markInTransit: (...args: unknown[]) => markInTransitMock(...args),
    complete: (...args: unknown[]) => completeMock(...args),
  },
}))

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
    success: (...args: unknown[]) => toastSuccessMock(...args),
  },
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

vi.mock("@/components/protected-route", () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock("@/components/ui/seal-badge", () => ({
  SealBadge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

vi.mock("@/components/runner/RunnerAvailableList", () => ({
  RunnerAvailableList: ({
    orders,
    onAccept,
  }: {
    orders: Order[]
    onAccept: (id: string) => void
  }) => (
    <div data-testid="available-list">
      <span>available:{orders.length}</span>
      {orders[0] ? (
        <button type="button" onClick={() => onAccept(orders[0].id)}>
          accept-first
        </button>
      ) : null}
    </div>
  ),
}))

vi.mock("@/components/runner/RunnerActiveOrderView", () => ({
  RunnerActiveOrderView: ({
    order,
    onInTransit,
    onComplete,
  }: {
    order: Order
    onInTransit: (id: string) => void
    onComplete: (id: string) => void
  }) => (
    <div data-testid="active-order-view">
      <span>{order.id}</span>
      <a href={`/runner/orders/${order.id}`}>detail-link</a>
      <button type="button" onClick={() => onInTransit(order.id)}>
        in-transit
      </button>
      <button type="button" onClick={() => onComplete(order.id)}>
        complete
      </button>
    </div>
  ),
}))

function makeOrder(overrides: Partial<Order>): Order {
  return {
    id: "order-1",
    userId: "runner-1",
    total: 0,
    deliveryFee: 4.5,
    status: "DELIVERED",
    createdAt: "2026-03-24T10:00:00.000Z",
    items: [],
    providerOrders: [],
    ...overrides,
  }
}

describe("Runner dashboard experience", () => {
  beforeEach(() => {
    getAvailableMock.mockReset()
    getAllMock.mockReset()
    toastErrorMock.mockReset()
    toastSuccessMock.mockReset()
    acceptMock.mockReset()
    markInTransitMock.mockReset()
    completeMock.mockReset()
  })

  it("shows active route mode when the runner already has a live delivery", async () => {
    getAvailableMock.mockResolvedValueOnce([])
    getAllMock.mockResolvedValueOnce([
      makeOrder({
        id: "delivery-live",
        status: "ASSIGNED",
      }),
    ])

    const Page = (await import("@/app/[locale]/runner/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByTestId("active-order-view")).toHaveTextContent("delivery-live")
    })

    expect(screen.queryByTestId("available-list")).not.toBeInTheDocument()
    expect(screen.queryByText(/Tu Histórico/i)).not.toBeInTheDocument()
  })

  it("shows available jobs and history when there is no active delivery", async () => {
    getAvailableMock.mockResolvedValueOnce([
      makeOrder({
        id: "available-1",
        status: "CONFIRMED",
      }),
    ])
    getAllMock.mockResolvedValueOnce([
      makeOrder({
        id: "historic-1",
        status: "DELIVERED",
      }),
    ])

    const Page = (await import("@/app/[locale]/runner/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText(/En el Barrio \(1\)/)).toBeInTheDocument()
    })

    expect(screen.getByRole("link", { name: /Cobros y estado/i })).toHaveAttribute(
      "href",
      "/runner/finance",
    )
    expect(screen.getByTestId("available-list")).toHaveTextContent("available:1")
    expect(screen.getByText(/Tu Histórico \(1\)/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Ver detalle/i })).toHaveAttribute(
      "href",
      "/runner/orders/historic-1",
    )
  })

  it("accepts an available order and refreshes the runner dashboard", async () => {
    getAvailableMock
      .mockResolvedValueOnce([
        makeOrder({
          id: "available-1",
          status: "CONFIRMED",
        }),
      ])
      .mockResolvedValueOnce([])
    getAllMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        makeOrder({
          id: "available-1",
          status: "ASSIGNED",
        }),
      ])
    acceptMock.mockResolvedValueOnce(undefined)

    const Page = (await import("@/app/[locale]/runner/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "accept-first" })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: "accept-first" }))

    await waitFor(() => {
      expect(acceptMock).toHaveBeenCalledWith("available-1")
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "¡Pedido aceptado! Modo Ruta Activa iniciado.",
      )
      expect(getAvailableMock).toHaveBeenCalledTimes(2)
      expect(getAllMock).toHaveBeenCalledTimes(2)
    })
  })

  it("surfaces the conflict message when the order can no longer be accepted", async () => {
    getAvailableMock
      .mockResolvedValueOnce([
        makeOrder({
          id: "available-1",
          status: "CONFIRMED",
        }),
      ])
      .mockResolvedValueOnce([])
    getAllMock.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    acceptMock.mockRejectedValueOnce({
      response: { status: 409 },
      message: "conflict",
    })

    const Page = (await import("@/app/[locale]/runner/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "accept-first" })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: "accept-first" }))

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "El pedido ya no está disponible o tu estado actual no permite aceptar más envíos.",
      )
    })
  })

  it("moves the active delivery through transit and completion actions", async () => {
    getAvailableMock.mockResolvedValue([])
    getAllMock
      .mockResolvedValueOnce([
        makeOrder({
          id: "delivery-live",
          status: "ASSIGNED",
        }),
      ])
      .mockResolvedValueOnce([
        makeOrder({
          id: "delivery-live",
          status: "IN_TRANSIT",
        }),
      ])
      .mockResolvedValueOnce([
        makeOrder({
          id: "delivery-live",
          status: "DELIVERED",
        }),
      ])
    markInTransitMock.mockResolvedValueOnce(undefined)
    completeMock.mockResolvedValueOnce(undefined)

    const Page = (await import("@/app/[locale]/runner/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByTestId("active-order-view")).toHaveTextContent("delivery-live")
    })

    fireEvent.click(screen.getByRole("button", { name: "in-transit" }))

    await waitFor(() => {
      expect(markInTransitMock).toHaveBeenCalledWith("delivery-live")
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "¡Bolsas recogidas! Modo Entrega Final activado.",
      )
    })

    fireEvent.click(screen.getByRole("button", { name: "complete" }))

    await waitFor(() => {
      expect(completeMock).toHaveBeenCalledWith("delivery-live")
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "¡Misión cumplida! Entrega completada exitosamente.",
      )
    })
  })
})
