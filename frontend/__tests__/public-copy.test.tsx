import { describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"

const mockUseLocale = vi.fn(() => "es")

vi.mock("next-intl", () => ({
  useLocale: () => mockUseLocale(),
}))

vi.mock("@/lib/navigation", () => ({
  Link: ({ href, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({
    back: vi.fn(),
  }),
}))

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "1" }),
}))

vi.mock("@/components/navbar", () => ({
  Navbar: () => <nav data-testid="navbar" />,
}))

vi.mock("@/components/footer", () => ({
  Footer: () => <footer data-testid="footer" />,
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...rest}>{children}</button>
  ),
}))

vi.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

vi.mock("@/components/ui/section-header", () => ({
  SectionHeader: ({ title, subtitle }: { title: string; subtitle: string }) => (
    <div>
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </div>
  ),
}))

vi.mock("@/components/ui/seal-badge", () => ({
  SealBadge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

vi.mock("@/components/product-card", () => ({
  ProductCard: ({ product }: { product: { name: string } }) => <article>{product.name}</article>,
}))

const mockAddItem = vi.fn(async () => null)
vi.mock("@/contexts/cart-context", () => ({
  useCart: () => ({
    addItem: mockAddItem,
  }),
}))

const mockGetAll = vi.fn()
const mockGetById = vi.fn()
vi.mock("@/lib/services/products-service", () => ({
  productsService: {
    getAll: (...args: unknown[]) => mockGetAll(...args),
    getById: (...args: unknown[]) => mockGetById(...args),
  },
}))

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

describe("public locale copy", () => {
  it("renders home english copy when locale is en", async () => {
    mockUseLocale.mockReturnValue("en")
    const HomeModule = await import("@/app/[locale]/page")
    const element = await HomeModule.default({ params: Promise.resolve({ locale: "en" }) })
    render(element)

    expect(screen.getByText("Support the workshops in your city")).toBeInTheDocument()
    expect(screen.getByText("What you can already do")).toBeInTheDocument()
    expect(screen.getAllByText("Create account").length).toBeGreaterThan(0)
  })

  it("renders products page english error copy", async () => {
    mockUseLocale.mockReturnValue("en")
    mockGetAll.mockRejectedValueOnce(new Error("boom"))
    const ProductsPage = (await import("@/app/[locale]/products/page")).default
    render(<ProductsPage />)

    await waitFor(() => {
      expect(screen.getByText("Product catalog")).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(screen.getByText("Products could not be loaded")).toBeInTheDocument()
    })
  })

  it("renders product detail english not found copy", async () => {
    mockUseLocale.mockReturnValue("en")
    mockGetById.mockRejectedValueOnce(new Error("not found"))
    const ProductDetailPage = (await import("@/app/[locale]/products/[id]/page")).default
    render(<ProductDetailPage />)

    await waitFor(() => {
      expect(screen.getByText("Back to catalog")).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(screen.getByText("Product not found")).toBeInTheDocument()
    })
  })
})
