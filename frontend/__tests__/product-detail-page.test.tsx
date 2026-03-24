import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { Product } from "@/lib/types"
import ProductDetailPage from "@/app/[locale]/products/[id]/page"

const getByIdMock = vi.fn()
const addItemMock = vi.fn()
const backMock = vi.fn()
const toastSuccessMock = vi.fn()
const toastErrorMock = vi.fn()

vi.mock("next-intl", () => ({
  useLocale: () => "es",
}))

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "product-1" }),
}))

vi.mock("@/lib/navigation", () => ({
  useRouter: () => ({
    back: backMock,
  }),
}))

vi.mock("@/components/navbar", () => ({
  Navbar: () => <div data-testid="navbar" />,
}))

vi.mock("@/components/footer", () => ({
  Footer: () => <div data-testid="footer" />,
}))

vi.mock("@/lib/services/products-service", () => ({
  productsService: {
    getById: (...args: unknown[]) => getByIdMock(...args),
  },
}))

vi.mock("@/contexts/cart-context", () => ({
  useCart: () => ({
    addItem: (...args: unknown[]) => addItemMock(...args),
  }),
}))

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}))

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "product-1",
    name: "Jarron azul",
    description: "Ceramica local",
    price: 12,
    basePrice: 15,
    discountPrice: 12,
    stock: 3,
    city: "Sevilla",
    category: "Ceramica",
    providerId: "provider-1",
    createdAt: "2026-03-24T10:00:00.000Z",
    imageUrl: "https://img.test/jarron.jpg",
    ...overrides,
  }
}

describe("ProductDetailPage", () => {
  beforeEach(() => {
    getByIdMock.mockReset()
    addItemMock.mockReset()
    backMock.mockReset()
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
  })

  it("shows not-found state when the product request fails", async () => {
    getByIdMock.mockRejectedValueOnce(new Error("missing"))

    render(<ProductDetailPage />)

    await waitFor(() => {
      expect(screen.getByText("Producto no encontrado")).toBeInTheDocument()
    })
  })

  it("renders product detail, enforces quantity bounds and adds items to cart", async () => {
    getByIdMock.mockResolvedValueOnce(makeProduct())
    addItemMock.mockResolvedValueOnce(null)

    render(<ProductDetailPage />)

    await waitFor(() => {
      expect(screen.getByText("Jarron azul")).toBeInTheDocument()
    })

    expect(screen.getByText("15.00 €")).toBeInTheDocument()
    expect(screen.getByText("12.00")).toBeInTheDocument()
    expect(screen.getByText("3 unidades disponibles")).toBeInTheDocument()

    const buttons = screen.getAllByRole("button")
    fireEvent.click(buttons[2])
    fireEvent.click(buttons[2])
    fireEvent.click(buttons[2])

    expect(screen.getByText("3")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Añadir al carrito" }))

    await waitFor(() => {
      expect(addItemMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: "product-1" }),
        3,
      )
    })

    expect(toastSuccessMock).toHaveBeenCalledWith(
      "Jarron azul (x3) añadido al carrito",
    )
  })

  it("shows a conflict toast when the cart rejects the product", async () => {
    getByIdMock.mockResolvedValueOnce(makeProduct({ stock: 1 }))
    addItemMock.mockResolvedValueOnce("Solo puedes comprar dentro de una ciudad")

    render(<ProductDetailPage />)

    await waitFor(() => {
      expect(screen.getByText("Jarron azul")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: "Añadir al carrito" }))

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "Solo puedes comprar dentro de una ciudad",
      )
    })
  })

  it("returns to catalog when the back button is pressed", async () => {
    getByIdMock.mockResolvedValueOnce(makeProduct())

    render(<ProductDetailPage />)

    await waitFor(() => {
      expect(screen.getByText("Jarron azul")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: "Volver al catálogo" }))

    expect(backMock).toHaveBeenCalled()
  })
})
