import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { Order } from "@/lib/types"

const getAllMock = vi.fn()
const useAuthMock = vi.fn()
const fetchMock = vi.fn()
const toastErrorMock = vi.fn()

vi.mock("@/lib/services/orders-service", () => ({
  ordersService: {
    getAll: (...args: unknown[]) => getAllMock(...args),
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

    const Page = (await import("@/app/[locale]/runner/finance/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("Cobros del runner")).toBeInTheDocument()
    })

    expect(screen.getByText("Cobros confirmados")).toBeInTheDocument()
    expect(screen.getByText("Pendientes de cobro")).toBeInTheDocument()
    expect(screen.getByText("Importe visible cobrado")).toBeInTheDocument()
    expect(screen.getByText(/Tu cuenta está conectada/i)).toBeInTheDocument()
    expect(screen.getByText("Cobrado")).toBeInTheDocument()
    expect(screen.getByText("Sesion lista")).toBeInTheDocument()
    expect(
      screen.getByText(/el runner no revisa ni ejecuta devoluciones desde este panel/i),
    ).toBeInTheDocument()
  })

  it("shows the stripe connect CTA when the runner is not connected yet", async () => {
    useAuthMock.mockReturnValue({
      user: {
        userId: "runner-1",
        name: "Rider Local",
        roles: ["RUNNER"],
        stripeAccountId: null,
        mfaEnabled: true,
        hasPin: true,
      },
    })
    getAllMock.mockResolvedValueOnce([])

    const Page = (await import("@/app/[locale]/runner/finance/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("Cobros del runner")).toBeInTheDocument()
    })

    expect(screen.getByRole("button", { name: /Conectar con Stripe/i })).toBeInTheDocument()
  })

  it("opens Stripe Connect only for a safe URL, and keeps the empty-state visible", async () => {
    useAuthMock.mockReturnValue({
      user: {
        userId: "runner-1",
        name: "Rider Local",
        roles: ["RUNNER"],
        stripeAccountId: null,
        mfaEnabled: true,
        hasPin: true,
      },
    })
    getAllMock.mockResolvedValueOnce([])
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
})
