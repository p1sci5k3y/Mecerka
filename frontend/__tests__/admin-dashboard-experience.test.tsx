import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"

const getMetricsMock = vi.fn()

vi.mock("@/lib/services/admin-service", () => ({
  adminService: {
    getMetrics: (...args: unknown[]) => getMetricsMock(...args),
  },
}))

vi.mock("@/components/navbar", () => ({
  Navbar: () => <nav data-testid="navbar" />,
}))

vi.mock("@/components/footer", () => ({
  Footer: () => <footer data-testid="footer" />,
}))

vi.mock("@/components/protected-route", () => ({
  ProtectedRoute: ({
    children,
    allowedRoles,
  }: {
    children: React.ReactNode
    allowedRoles?: string[]
  }) => <div data-allowed-roles={allowedRoles?.join(",")}>{children}</div>,
}))

vi.mock("@/lib/navigation", () => ({
  Link: ({ href, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

describe("Admin dashboard experience", () => {
  beforeEach(() => {
    getMetricsMock.mockReset()
  })

  it("renders loading state before metrics arrive", async () => {
    getMetricsMock.mockImplementation(
      () => new Promise(() => undefined),
    )

    const Page = (await import("@/app/[locale]/admin/page")).default
    render(<Page />)

    expect(screen.getByText("Cargando métricas...")).toBeInTheDocument()
  })

  it("shows platform metrics and wraps the page in admin-only protection", async () => {
    getMetricsMock.mockResolvedValueOnce({
      totalUsers: 120,
      totalProviders: 18,
      totalClients: 95,
      totalOrders: 342,
      totalRevenue: 12540.75,
    })

    const Page = (await import("@/app/[locale]/admin/page")).default
    const { container } = render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("Usuarios totales")).toBeInTheDocument()
    })

    expect(container.querySelector('[data-allowed-roles="ADMIN"]')).not.toBeNull()
    expect(screen.getByText("120")).toBeInTheDocument()
    expect(screen.getByText("18")).toBeInTheDocument()
    expect(screen.getByText("342")).toBeInTheDocument()
    expect(screen.getByText("12.540,75 €")).toBeInTheDocument()
    expect(screen.getByText("Resumen de Actividad")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Revisar devoluciones/i })).toHaveAttribute(
      "href",
      "/admin/refunds",
    )
    expect(screen.getByRole("link", { name: /Gestionar incidencias/i })).toHaveAttribute(
      "href",
      "/admin/incidents",
    )
  })

  it("shows an explicit error state when metrics cannot be loaded", async () => {
    getMetricsMock.mockRejectedValueOnce(new Error("boom"))

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const Page = (await import("@/app/[locale]/admin/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("Error al cargar métricas")).toBeInTheDocument()
    })

    consoleErrorSpy.mockRestore()
  })
})
