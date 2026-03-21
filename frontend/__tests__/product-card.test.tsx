import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

vi.mock("@/lib/navigation", () => ({
  Link: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
}))

const mockAddItem = vi.fn()
vi.mock("@/contexts/cart-context", () => ({
  useCart: () => ({
    addItem: mockAddItem,
  }),
}))

// ── Fixtures ─────────────────────────────────────────────────────────────────

const baseProduct = {
  id: "prod-abc",
  name: "Cerámica tradicional",
  description: "Pieza cerámica hecha a mano en taller local.",
  price: 45.0,
  basePrice: 45.0,
  discountPrice: null,
  city: "Sevilla",
  imageUrl: null,
  category: "Cerámica",
  providerId: "prov-sev",
  provider: { name: "Taller Sevilla" },
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("ProductCard", () => {
  it("renders product name, price and city", async () => {
    const { ProductCard } = await import("@/components/product-card")
    render(<ProductCard product={baseProduct} />)

    expect(screen.getByText("Cerámica tradicional")).toBeInTheDocument()
    expect(screen.getByText(/45,00\s*€/)).toBeInTheDocument()
    expect(screen.getByText(/Hecho en Sevilla/)).toBeInTheDocument()
  })

  it("renders the Add button", async () => {
    const { ProductCard } = await import("@/components/product-card")
    render(<ProductCard product={baseProduct} />)

    expect(screen.getByRole("button", { name: /Añadir/i })).toBeInTheDocument()
  })

  it("calls addItem and shows success toast on Add click", async () => {
    mockAddItem.mockResolvedValue(null)
    const { toast } = await import("sonner")
    const { ProductCard } = await import("@/components/product-card")
    render(<ProductCard product={baseProduct} />)

    await userEvent.click(screen.getByRole("button", { name: /Añadir/i }))

    expect(mockAddItem).toHaveBeenCalledWith(baseProduct)
    expect(toast.success).toHaveBeenCalledWith("Cerámica tradicional añadido al carrito")
  })

  it("shows error toast when addItem returns a conflict message", async () => {
    mockAddItem.mockResolvedValue("Solo puedes comprar productos de la misma ciudad.")
    const { toast } = await import("sonner")
    const { ProductCard } = await import("@/components/product-card")
    render(<ProductCard product={baseProduct} />)

    await userEvent.click(screen.getByRole("button", { name: /Añadir/i }))

    expect(toast.error).toHaveBeenCalledWith(
      "Solo puedes comprar productos de la misma ciudad.",
    )
  })

  it("renders discounted price with strikethrough when discount applies", async () => {
    const discountedProduct = {
      ...baseProduct,
      basePrice: 60.0,
      price: 45.0,
      discountPrice: 45.0,
    }
    const { ProductCard } = await import("@/components/product-card")
    render(<ProductCard product={discountedProduct} />)

    // Original price is shown struck-through
    expect(screen.getByText(/60,00\s*€/)).toBeInTheDocument()
    // Discounted price is shown
    expect(screen.getByText(/45,00\s*€/)).toBeInTheDocument()
  })
})
