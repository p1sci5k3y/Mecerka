import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { Order } from "@/lib/types"

const getAllMock = vi.fn()
const useAuthMock = vi.fn()
const fetchMock = vi.fn()
const toastErrorMock = vi.fn()
const listDeliveryOrderIncidentsMock = vi.fn()
const getDeliveryOrderRefundsMock = vi.fn()
const getConnectStatusMock = vi.fn()

vi.mock("@/lib/services/orders-service", () => ({
  ordersService: {
    getAll: (...args: unknown[]) => getAllMock(...args),
  },
}))

vi.mock("@/lib/services/payments-service", () => ({
  paymentsService: {
    getConnectStatus: (...args: unknown[]) => getConnectStatusMock(...args),
  },
}))

vi.mock("@/lib/services/delivery-incidents-service", () => ({
  deliveryIncidentsService: {
    listDeliveryOrderIncidents: (...args: unknown[]) => listDeliveryOrderIncidentsMock(...args),
  },
}))

vi.mock("@/lib/services/refunds-service", () => ({
  refundsService: {
    getDeliveryOrderRefunds: (...args: unknown[]) => getDeliveryOrderRefundsMock(...args),
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
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}))

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    userId: "client-1",
    total: 48,
    deliveryFee: 4.5,
    status: "DELIVERED",
    createdAt: "2026-03-24T10:00:00.000Z",
    updatedAt: "2026-03-24T11:00:00.000Z",
    items: [],
    providerOrders: [],
    deliveryOrder: {
      id: "delivery-1",
      runnerId: "runner-1",
      status: "DELIVERED",
      paymentStatus: "PAID",
    },
    ...overrides,
  }
}

describe("Runner finance page", () => {
  beforeEach(() => {
    getAllMock.mockReset()
    fetchMock.mockReset()
    toastErrorMock.mockReset()
    listDeliveryOrderIncidentsMock.mockReset()
    getDeliveryOrderRefundsMock.mockReset()
    getConnectStatusMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    useAuthMock.mockReturnValue({
      user: {
        userId: "runner-1",
        name: "Rider Local",
        roles: ["RUNNER"],
        stripeAccountId: "acct_runner_123",
        mfaEnabled: true,
        hasPin: true,
      },
    })
    getConnectStatusMock.mockResolvedValue({
      provider: "STRIPE",
      ownerType: "RUNNER",
      status: "READY",
      accountId: "acct_runner_123",
      configured: true,
      detailsSubmitted: true,
      chargesEnabled: true,
      payoutsEnabled: true,
      paymentAccountActive: true,
      requirementsDue: [],
      requirementsDisabledReason: null,
    })
  })

  it("shows connected payout state and visible payment statuses without pretending the runner manages refunds", async () => {
    getAllMock.mockResolvedValueOnce([
      makeOrder(),
      makeOrder({
        id: "order-2",
        deliveryFee: 6,
        status: "IN_TRANSIT",
        deliveryOrder: {
          id: "delivery-2",
          runnerId: "runner-1",
          status: "ASSIGNED",
          paymentStatus: "PAYMENT_READY",
        },
      }),
    ])
    listDeliveryOrderIncidentsMock
      .mockResolvedValueOnce([
        {
          id: "incident-1",
          deliveryOrderId: "delivery-1",
          reporterRole: "CLIENT",
          type: "FAILED_DELIVERY",
          status: "OPEN",
          description: "Entrega retrasada",
          evidenceUrl: null,
          createdAt: "2026-03-24T12:00:00.000Z",
          resolvedAt: null,
        },
      ])
      .mockResolvedValueOnce([])
    getDeliveryOrderRefundsMock
      .mockResolvedValueOnce([
        {
          id: "refund-1",
          incidentId: "incident-1",
          providerOrderId: null,
          deliveryOrderId: "delivery-1",
          type: "DELIVERY_PARTIAL",
          status: "UNDER_REVIEW",
          amount: 2,
          currency: "EUR",
          requestedById: "client-1",
          reviewedById: null,
          externalRefundId: null,
          createdAt: "2026-03-24T12:10:00.000Z",
          reviewedAt: null,
          completedAt: null,
        },
      ])
      .mockResolvedValueOnce([])

    const Page = (await import("@/app/[locale]/runner/finance/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("Cobros del runner")).toBeInTheDocument()
    })

    expect(screen.getByText("Cobros confirmados")).toBeInTheDocument()
    expect(screen.getByText("Pendientes de cobro")).toBeInTheDocument()
    expect(screen.getByText("Importe visible cobrado")).toBeInTheDocument()
    expect(screen.getByText("Incidencias visibles")).toBeInTheDocument()
    expect(screen.getByText("Devoluciones visibles")).toBeInTheDocument()
    expect(screen.getByText(/Tu cuenta está conectada, activa y preparada/i)).toBeInTheDocument()
    expect(screen.getByText("Cuenta activa")).toBeInTheDocument()
    expect(screen.getAllByText("Habilitados")).toHaveLength(2)
    expect(screen.getByText("Cobrado")).toBeInTheDocument()
    expect(screen.getByText("Sesion lista")).toBeInTheDocument()
    expect(screen.getByText(/Soporte visible:\s*1 devoluciones · 1 incidencias/i)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Abrir soporte operativo/i })).toHaveAttribute(
      "href",
      "/runner/orders/order-1",
    )
    expect(screen.getByRole("link", { name: "Centro de soporte" })).toHaveAttribute(
      "href",
      "/runner/support",
    )
    expect(screen.getByRole("link", { name: /Abrir centro de soporte/i })).toHaveAttribute(
      "href",
      "/runner/support",
    )
    expect(screen.getAllByRole("link", { name: /Ver detalle/i })[0]).toHaveAttribute(
      "href",
      "/runner/orders/order-1",
    )
    expect(
      screen.getByText(/el runner no revisa ni ejecuta devoluciones desde este panel/i),
    ).toBeInTheDocument()
    expect(getAllMock).toHaveBeenCalled()
    expect(listDeliveryOrderIncidentsMock).toHaveBeenCalledWith("delivery-1")
    expect(getDeliveryOrderRefundsMock).toHaveBeenCalledWith("delivery-1")
  })

  it("shows the stripe connect CTA when the runner is not connected yet", async () => {
    getConnectStatusMock.mockResolvedValueOnce({
      provider: "STRIPE",
      ownerType: "RUNNER",
      status: "NOT_CONNECTED",
      accountId: null,
      configured: false,
      detailsSubmitted: false,
      chargesEnabled: false,
      payoutsEnabled: false,
      paymentAccountActive: false,
      requirementsDue: [],
      requirementsDisabledReason: null,
    })
    getAllMock.mockResolvedValueOnce([])
    listDeliveryOrderIncidentsMock.mockResolvedValue([])
    getDeliveryOrderRefundsMock.mockResolvedValue([])

    const Page = (await import("@/app/[locale]/runner/finance/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("Cobros del runner")).toBeInTheDocument()
    })

    expect(screen.getByRole("button", { name: /Conectar con Stripe/i })).toBeInTheDocument()
  })

  it("shows a completion CTA when Stripe onboarding exists but is still incomplete", async () => {
    getConnectStatusMock.mockResolvedValueOnce({
      provider: "STRIPE",
      ownerType: "RUNNER",
      status: "ONBOARDING_REQUIRED",
      accountId: "acct_runner_pending",
      configured: true,
      detailsSubmitted: false,
      chargesEnabled: false,
      payoutsEnabled: false,
      paymentAccountActive: false,
      requirementsDue: ["external_account"],
      requirementsDisabledReason: null,
    })
    getAllMock.mockResolvedValueOnce([])
    listDeliveryOrderIncidentsMock.mockResolvedValue([])
    getDeliveryOrderRefundsMock.mockResolvedValue([])

    const Page = (await import("@/app/[locale]/runner/finance/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText(/onboarding stripe pendiente/i)).toBeInTheDocument()
    })

    expect(screen.getByRole("button", { name: /Completar onboarding/i })).toBeInTheDocument()
    expect(screen.getByText(/Requisitos pendientes: external_account/i)).toBeInTheDocument()
  })

  it("opens Stripe Connect only for a safe URL, and keeps the empty-state visible", async () => {
    getConnectStatusMock.mockResolvedValueOnce({
      provider: "STRIPE",
      ownerType: "RUNNER",
      status: "NOT_CONNECTED",
      accountId: null,
      configured: false,
      detailsSubmitted: false,
      chargesEnabled: false,
      payoutsEnabled: false,
      paymentAccountActive: false,
      requirementsDue: [],
      requirementsDisabledReason: null,
    })
    getAllMock.mockResolvedValueOnce([])
    listDeliveryOrderIncidentsMock.mockResolvedValue([])
    getDeliveryOrderRefundsMock.mockResolvedValue([])
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: "https://connect.stripe.com/setup/s/demo" }),
    })

    const locationValue = { href: "" }
    Object.defineProperty(window, "location", {
      configurable: true,
      value: locationValue,
    })

    const Page = (await import("@/app/[locale]/runner/finance/page")).default
    const { rerender } = render(<Page />)

    await waitFor(() => {
      expect(screen.getByText(/Aun no tienes repartos con datos de cobro visibles/i)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: /Conectar con Stripe/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("https://api.mecerka.test/payments/connect/link", {
        credentials: "include",
      })
      expect(locationValue.href).toBe("https://connect.stripe.com/setup/s/demo")
    })

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: "https://evil.example/phish" }),
    })
    rerender(<Page />)
    fireEvent.click(screen.getByRole("button", { name: /Conectar con Stripe/i }))

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("No se pudo iniciar la conexión con Stripe.")
    })
  })

  it("degrades safely when the main runner finance load fails", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    getAllMock.mockRejectedValueOnce(new Error("finance down"))
    getConnectStatusMock.mockResolvedValueOnce(null)

    const Page = (await import("@/app/[locale]/runner/finance/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("Cobros del runner")).toBeInTheDocument()
    })

    expect(
      screen.getByText(/Aun no tienes repartos con datos de cobro visibles/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/No hay devoluciones ni incidencias visibles en tus repartos ahora mismo/i),
    ).toBeInTheDocument()
    expect(listDeliveryOrderIncidentsMock).not.toHaveBeenCalled()
    expect(getDeliveryOrderRefundsMock).not.toHaveBeenCalled()
    expect(toastErrorMock).toHaveBeenCalledWith(
      "No se pudo cargar el centro financiero del runner.",
    )
    consoleErrorSpy.mockRestore()
  })
})
