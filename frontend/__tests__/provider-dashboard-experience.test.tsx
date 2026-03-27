import { beforeEach, afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { Order, SalesChartData } from "@/lib/types"

const getProviderStatsMock = vi.fn()
const getSalesChartMock = vi.fn()
const getAllMock = vi.fn()
const useAuthMock = vi.fn()
const toastSuccessMock = vi.fn()
const toastErrorMock = vi.fn()
const fetchMock = vi.fn()

vi.mock("@/lib/services/orders-service", () => ({
  ordersService: {
    getProviderStats: (...args: unknown[]) => getProviderStatsMock(...args),
    getSalesChart: (...args: unknown[]) => getSalesChartMock(...args),
    getAll: (...args: unknown[]) => getAllMock(...args),
  },
}))

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => useAuthMock(),
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    asChild,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) =>
    asChild ? <>{children}</> : <button {...rest}>{children}</button>,
}))

vi.mock("@/lib/runtime-config", () => ({
  getApiBaseUrl: () => "https://api.mecerka.test",
}))

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}))

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    userId: "client-1",
    total: 0,
    deliveryFee: 4,
    status: "CONFIRMED",
    createdAt: "2026-03-24T10:00:00.000Z",
    items: [],
    providerOrders: [],
    ...overrides,
  }
}

describe("ProviderDashboard financial experience", () => {
  beforeEach(() => {
    getProviderStatsMock.mockReset()
    getSalesChartMock.mockReset()
    getAllMock.mockReset()
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    window.history.replaceState({}, "", "/es/dashboard/provider")
  })

  afterEach(() => {
    window.history.replaceState({}, "", "/")
  })

  it("shows monthly revenue, recent orders and Stripe connected state", async () => {
    useAuthMock.mockReturnValue({
      user: {
        userId: "provider-1",
        name: "Taller Sevilla",
        roles: ["PROVIDER"],
        stripeAccountId: "acct_123",
        mfaEnabled: true,
        hasPin: true,
      },
    })
    getProviderStatsMock.mockResolvedValueOnce({
      totalRevenue: 1250.5,
      totalOrders: 18,
      itemsSold: 42,
      averageTicket: 69.47,
    })
    const salesData: SalesChartData[] = [
      { date: "2026-03-22", amount: 300 },
      { date: "2026-03-23", amount: 450 },
    ]
    getSalesChartMock.mockResolvedValueOnce(salesData)
    getAllMock.mockResolvedValueOnce([
      makeOrder({ id: "order-a", status: "CONFIRMED" }),
      makeOrder({ id: "order-b", status: "DELIVERED" }),
    ])
    window.history.replaceState({}, "", "/es/dashboard/provider?stripe_connected=true")

    const { ProviderDashboard } = await import(
      "@/app/[locale]/dashboard/provider-dashboard"
    )
    render(<ProviderDashboard />)

    await waitFor(() => {
      expect(screen.getByText("Facturación Mensual")).toBeInTheDocument()
    })

    expect(screen.getAllByText("€1250.50")).toHaveLength(2)
    expect(screen.getByText("18")).toBeInTheDocument()
    expect(screen.getByText("42")).toBeInTheDocument()
    expect(screen.getByText("€69.47")).toBeInTheDocument()
    expect(
      screen.getByText(/Tu cuenta bancaria está conectada y verificada/i),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /Conectar con Stripe/i }),
    ).not.toBeInTheDocument()
    expect(screen.getByText("Últimos Pedidos")).toBeInTheDocument()
    expect(screen.getByText("#ORDER-A")).toBeInTheDocument()
    expect(screen.getByText("Confirmado")).toBeInTheDocument()
    expect(screen.getByText("Entregado")).toBeInTheDocument()
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "¡Cuenta de Stripe vinculada con éxito!",
    )
  })

  it("shows the connection CTA and empty monthly trend state when there is no financial history yet", async () => {
    useAuthMock.mockReturnValue({
      user: {
        userId: "provider-1",
        name: "Taller Sevilla",
        roles: ["PROVIDER"],
        stripeAccountId: null,
        mfaEnabled: true,
        hasPin: true,
      },
    })
    getProviderStatsMock.mockResolvedValueOnce({
      totalRevenue: 0,
      totalOrders: 0,
      itemsSold: 0,
      averageTicket: 0,
    })
    getSalesChartMock.mockResolvedValueOnce([])
    getAllMock.mockResolvedValueOnce([])

    const { ProviderDashboard } = await import(
      "@/app/[locale]/dashboard/provider-dashboard"
    )
    render(<ProviderDashboard />)

    await waitFor(() => {
      expect(screen.getByText("Facturación Mensual")).toBeInTheDocument()
    })

    expect(
      screen.getByText(/Debes conectar tu cuenta bancaria \(Stripe\)/i),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /Conectar con Stripe/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/No hay suficientes datos de ventas para mostrar la gráfica/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/Aún no hay pedidos en tu taller/i)).toBeInTheDocument()
  })

  it("starts Stripe onboarding only with a safe Stripe URL and surfaces verification errors", async () => {
    useAuthMock.mockReturnValue({
      user: {
        userId: "provider-1",
        name: "Taller Sevilla",
        roles: ["PROVIDER"],
        stripeAccountId: null,
      },
    })
    getProviderStatsMock.mockResolvedValue({
      totalRevenue: 0,
      totalOrders: 0,
      itemsSold: 0,
      averageTicket: 0,
    })
    getSalesChartMock.mockResolvedValue([])
    getAllMock.mockResolvedValue([])
    const { ProviderDashboard } = await import(
      "@/app/[locale]/dashboard/provider-dashboard"
    )
    window.history.replaceState({}, "", "/es/dashboard/provider?error=verification_failed")
    const { rerender } = render(<ProviderDashboard />)

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Conectar con Stripe/i }),
      ).toBeInTheDocument()
    })

    expect(toastErrorMock).toHaveBeenCalledWith(
      "Hubo un problema verificando tu cuenta de Stripe. Asegúrate de completar todos los datos.",
    )

    const locationValue = { href: "", pathname: "/es/dashboard/provider", search: "" }
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: locationValue,
    })

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: "https://connect.stripe.com/setup/s/provider-demo" }),
    })

    fireEvent.click(screen.getByRole("button", { name: /Conectar con Stripe/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.mecerka.test/payments/connect/link",
        { credentials: "include" },
      )
      expect(locationValue.href).toBe("https://connect.stripe.com/setup/s/provider-demo")
    })

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: "https://evil.example/phish" }),
    })
    rerender(<ProviderDashboard />)

    fireEvent.click(screen.getByRole("button", { name: /Conectar con Stripe/i }))

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "No se pudo iniciar la conexión con Stripe.",
      )
    })
  })
})
