import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

const getAllMock = vi.fn()
const toastSuccessMock = vi.fn()
const toastErrorMock = vi.fn()
const useAuthMock = vi.fn()
const fetchMock = vi.fn()
const replaceStateMock = vi.fn()
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

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => useAuthMock(),
}))

vi.mock("@/lib/runtime-config", () => ({
  getApiBaseUrl: () => "https://demo.mecerka.me/api",
}))

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, asChild, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) =>
    asChild ? <>{children}</> : <button {...rest}>{children}</button>,
}))

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    userId: "client-1",
    total: 40,
    deliveryFee: 4,
    status: "DELIVERED",
    createdAt: "2026-03-26T10:00:00.000Z",
    items: [
      {
        id: "item-1",
        quantity: 2,
        priceAtPurchase: 10,
        product: {
          id: "prod-1",
          imageUrl: "",
        },
      },
    ],
    providerOrders: [],
    deliveryAddress: "Calle Real 1",
    ...overrides,
  }
}

describe("RunnerDashboard component", () => {
  beforeEach(() => {
    getAllMock.mockReset()
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
    useAuthMock.mockReset()
    fetchMock.mockReset()
    getConnectStatusMock.mockReset()

    vi.stubGlobal("fetch", fetchMock)
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: new URL("https://demo.mecerka.me/runner?stripe_connected=true"),
    })
    Object.defineProperty(globalThis, "history", {
      configurable: true,
      value: {
        replaceState: replaceStateMock,
      },
    })
    getConnectStatusMock.mockResolvedValue({
      provider: "STRIPE",
      ownerType: "RUNNER",
      status: "READY",
      accountId: "acct_runner",
      configured: true,
      detailsSubmitted: true,
      chargesEnabled: true,
      payoutsEnabled: true,
      paymentAccountActive: true,
      requirementsDue: [],
      requirementsDisabledReason: null,
    })
  })

  it("loads current and completed deliveries, shows the oauth success toast and refreshes after marking delivered", async () => {
    useAuthMock.mockReturnValue({
      user: {
        name: "Rider Demo",
        stripeAccountId: "acct_runner",
      },
    })
    getAllMock
      .mockResolvedValueOnce([
        makeOrder({ id: "active-1", status: "ASSIGNED" }),
        makeOrder({ id: "done-1", status: "DELIVERED" }),
      ])
      .mockResolvedValueOnce([makeOrder({ id: "done-1", status: "DELIVERED" })])

    const { RunnerDashboard } = await import("@/app/[locale]/dashboard/runner-dashboard")
    render(<RunnerDashboard />)

    await waitFor(() => {
      expect(screen.getByText(/Panel de Ruta - Rider/i)).toBeInTheDocument()
    })

    expect(toastSuccessMock).toHaveBeenCalledWith("¡Cuenta de Stripe vinculada con éxito!")
    expect(replaceStateMock).toHaveBeenCalled()
    expect(screen.getByText(/Tu cuenta Stripe está lista para cobrar/i)).toBeInTheDocument()
    expect(screen.getByText("1")).toBeInTheDocument()
    expect(screen.getByText("€2.00")).toBeInTheDocument()
    expect(screen.getByText("0.5h")).toBeInTheDocument()
    expect(screen.getByText(/Orden #ACTIVE-1/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /Marcar Entregado/i }))

    await waitFor(() => {
      expect(getAllMock).toHaveBeenCalledTimes(2)
      expect(screen.getByText(/No tienes entregas pendientes/i)).toBeInTheDocument()
    })
  })

  it("starts stripe onboarding only for a safe Stripe URL and rejects unsafe links", async () => {
    useAuthMock.mockReturnValue({
      user: {
        name: "Rider Demo",
        stripeAccountId: null,
      },
    })
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
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: "https://connect.stripe.com/setup/s/demo" }),
    })

    const locationValue = { href: "", pathname: "/runner", search: "" }
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: locationValue,
    })

    const { RunnerDashboard } = await import("@/app/[locale]/dashboard/runner-dashboard")
    const { rerender } = render(<RunnerDashboard />)

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Conectar con Stripe/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: /Conectar con Stripe/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "https://demo.mecerka.me/api/payments/connect/link",
        { credentials: "include" },
      )
      expect(locationValue.href).toBe("https://connect.stripe.com/setup/s/demo")
    })

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: "https://evil.example/phish" }),
    })
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
    rerender(<RunnerDashboard />)

    fireEvent.click(screen.getByRole("button", { name: /Conectar con Stripe/i }))

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "No se pudo iniciar la conexión con Stripe.",
      )
    })
  })

  it("shows a completion CTA when stripe onboarding is still incomplete", async () => {
    useAuthMock.mockReturnValue({
      user: {
        name: "Rider Demo",
        stripeAccountId: "acct_runner_pending",
      },
    })
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

    const { RunnerDashboard } = await import("@/app/[locale]/dashboard/runner-dashboard")
    render(<RunnerDashboard />)

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Completar onboarding/i })).toBeInTheDocument()
    })
  })
})
