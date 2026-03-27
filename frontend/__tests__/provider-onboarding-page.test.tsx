import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import type { Product } from "@/lib/types"

const getMyProductsMock = vi.fn()
const useAuthMock = vi.fn()

vi.mock("@/components/protected-route", () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock("@/components/navbar", () => ({
  Navbar: () => <div data-testid="navbar" />,
}))

vi.mock("@/components/footer", () => ({
  Footer: () => <div data-testid="footer" />,
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

vi.mock("@/lib/navigation", () => ({
  Link: ({ href, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock("@/lib/services/products-service", () => ({
  productsService: {
    getMyProducts: (...args: unknown[]) => getMyProductsMock(...args),
  },
}))

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "product-1",
    name: "Jarrón azul",
    description: "Cerámica local",
    price: 12,
    stock: 8,
    city: "Sevilla",
    category: "Cerámica",
    providerId: "provider-1",
    createdAt: "2026-03-27T10:00:00.000Z",
    ...overrides,
  }
}

describe("ProviderOnboardingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthMock.mockReturnValue({
      user: {
        userId: "provider-1",
        roles: ["PROVIDER"],
        stripeAccountId: null,
      },
    })
  })

  it("shows the onboarding status with pending payouts", async () => {
    getMyProductsMock.mockResolvedValueOnce([makeProduct(), makeProduct({ id: "product-2", stock: 2 })])

    const Page = (await import("@/app/[locale]/provider/onboarding/page")).default
    render(<Page />)

    expect(await screen.findByText("Publica catálogo y activa cobros sin ir a ciegas")).toBeInTheDocument()
    expect(screen.getByText("2")).toBeInTheDocument()
    expect(screen.getByText("Pendiente")).toBeInTheDocument()
    expect(screen.getByText(/Tienes 1 producto\(s\) con stock bajo/i)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Crear producto/i })).toHaveAttribute(
      "href",
      "/provider/products/new",
    )
  })

  it("shows completed onboarding milestones when products and Stripe are already ready", async () => {
    useAuthMock.mockReturnValue({
      user: {
        userId: "provider-1",
        roles: ["PROVIDER"],
        stripeAccountId: "acct_provider_123",
      },
    })
    getMyProductsMock.mockResolvedValueOnce([makeProduct()])

    const Page = (await import("@/app/[locale]/provider/onboarding/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("Conectado")).toBeInTheDocument()
    })

    expect(screen.getByText(/Tu cuenta ya puede recibir liquidaciones/i)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Cobros y devoluciones/i })).toHaveAttribute(
      "href",
      "/provider/finance",
    )
  })
})
