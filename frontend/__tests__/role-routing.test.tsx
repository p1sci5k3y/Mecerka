import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, waitFor } from "@testing-library/react"
import type { User } from "@/lib/types"

const mockReplace = vi.fn()
const mockGetPublicRuntimeConfig = vi.fn(async () => ({ requireMfa: false }))
const mockUseAuth = vi.fn()
const mockUsePathname = vi.fn(() => "/dashboard")

vi.mock("@/lib/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
  usePathname: () => mockUsePathname(),
}))

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => mockUseAuth(),
}))

vi.mock("@/lib/runtime-config", () => ({
  getPublicRuntimeConfig: () => mockGetPublicRuntimeConfig(),
}))

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}))

vi.mock("@/components/navbar", () => ({
  Navbar: () => <nav data-testid="navbar" />,
}))

vi.mock("@/components/footer", () => ({
  Footer: () => <footer data-testid="footer" />,
}))

vi.mock("@/app/[locale]/dashboard/client-dashboard", () => ({
  ClientDashboard: () => <section data-testid="client-dashboard" />,
}))

const authenticatedState = (roles: User["roles"]) => ({
  user: {
    userId: "user-1",
    roles,
    mfaEnabled: true,
    hasPin: true,
    name: "Test user",
  },
  isLoading: false,
  isAuthenticated: true,
})

describe("role routing", () => {
  beforeEach(() => {
    mockReplace.mockReset()
    mockUsePathname.mockReturnValue("/dashboard")
    mockGetPublicRuntimeConfig.mockResolvedValue({ requireMfa: false })
  })

  it("maps each primary role to its panel", async () => {
    const { getPrimaryRouteForRoles } = await import("@/lib/role-navigation")

    expect(getPrimaryRouteForRoles(["CLIENT"])).toBe("/dashboard")
    expect(getPrimaryRouteForRoles(["RUNNER"])).toBe("/runner")
    expect(getPrimaryRouteForRoles(["PROVIDER"])).toBe("/provider/sales")
    expect(getPrimaryRouteForRoles(["ADMIN"])).toBe("/admin")
    expect(getPrimaryRouteForRoles(["PROVIDER", "ADMIN"])).toBe("/admin")
  })

  it("redirects unauthenticated protected routes to login", async () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isLoading: false,
      isAuthenticated: false,
    })

    const { ProtectedRoute } = await import("@/components/protected-route")
    render(
      <ProtectedRoute>
        <div>private</div>
      </ProtectedRoute>,
    )

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/login")
    })
  })

  it("redirects authenticated users without the required role to their own primary panel", async () => {
    mockUseAuth.mockReturnValue(authenticatedState(["RUNNER"]))

    const { ProtectedRoute } = await import("@/components/protected-route")
    render(
      <ProtectedRoute allowedRoles={["ADMIN"]}>
        <div>admin only</div>
      </ProtectedRoute>,
    )

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/runner")
    })
  })

  it("redirects non-client roles away from the client dashboard", async () => {
    mockUseAuth.mockReturnValue(authenticatedState(["PROVIDER"]))

    const DashboardPage = (await import("@/app/[locale]/dashboard/page")).default
    render(<DashboardPage />)

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/provider/sales")
    })
  })
})
