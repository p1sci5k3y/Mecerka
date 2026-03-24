import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { Product } from "@/lib/types"
import ProductsPage from "@/app/[locale]/products/page"

const getAllMock = vi.fn()

vi.mock("next-intl", () => ({
  useLocale: () => "es",
}))

vi.mock("@/components/navbar", () => ({
  Navbar: () => <div data-testid="navbar" />,
}))

vi.mock("@/components/footer", () => ({
  Footer: () => <div data-testid="footer" />,
}))

vi.mock("@/components/product-card", () => ({
  ProductCard: ({ product }: { product: Product }) => (
    <article data-testid="product-card">
      <span>{product.name}</span>
      <span>{product.city}</span>
      <span>{product.category}</span>
    </article>
  ),
}))

vi.mock("@/lib/services/products-service", () => ({
  productsService: {
    getAll: (...args: unknown[]) => getAllMock(...args),
  },
}))

function makeProducts(): Product[] {
  return [
    {
      id: "1",
      name: "Jarron azul",
      description: "Ceramica pintada a mano",
      price: 12,
      basePrice: 15,
      discountPrice: 12,
      stock: 4,
      city: "Sevilla",
      category: "Ceramica",
      providerId: "provider-1",
      createdAt: "2026-03-24T10:00:00.000Z",
    },
    {
      id: "2",
      name: "Bolso cuero",
      description: "Piel vegetal",
      price: 28,
      stock: 2,
      city: "Madrid",
      category: "Moda",
      providerId: "provider-2",
      createdAt: "2026-03-24T10:00:00.000Z",
    },
  ]
}

describe("ProductsPage", () => {
  beforeEach(() => {
    getAllMock.mockReset()
  })

  it("renders remote products and allows filtering by search, city and category", async () => {
    getAllMock.mockResolvedValueOnce(makeProducts())

    render(<ProductsPage />)

    await waitFor(() => {
      expect(screen.getByText("Jarron azul")).toBeInTheDocument()
      expect(screen.getByText("Bolso cuero")).toBeInTheDocument()
    })

    fireEvent.change(
      screen.getByPlaceholderText("Busca por pieza, taller o técnica..."),
      {
      target: { value: "jarron" },
      },
    )

    expect(screen.getByText("Jarron azul")).toBeInTheDocument()
    expect(screen.queryByText("Bolso cuero")).not.toBeInTheDocument()

    const selects = screen.getAllByRole("combobox")
    fireEvent.change(selects[0], {
      target: { value: "Sevilla" },
    })

    expect(screen.getByText("Jarron azul")).toBeInTheDocument()

    fireEvent.change(selects[1], {
      target: { value: "Moda" },
    })

    expect(
      screen.getByText("No se encontraron productos con estos filtros"),
    ).toBeInTheDocument()
  })

  it("shows a safe empty state when loading products fails", async () => {
    getAllMock.mockRejectedValueOnce(new Error("network"))

    render(<ProductsPage />)

    await waitFor(() => {
      expect(
        screen.getByText("No se pudieron cargar los productos"),
      ).toBeInTheDocument()
    })
  })
})
