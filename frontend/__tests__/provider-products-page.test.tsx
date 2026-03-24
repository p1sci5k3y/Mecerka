import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { Product } from "@/lib/types"
import ProviderProductsPage from "@/app/[locale]/provider/products/page"

const getMyProductsMock = vi.fn()
const deleteProductMock = vi.fn()
const toastMock = vi.fn()

vi.mock("@/components/protected-route", () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock("@/components/navbar", () => ({
  Navbar: () => <div data-testid="navbar" />,
}))

vi.mock("@/components/footer", () => ({
  Footer: () => <div data-testid="footer" />,
}))

vi.mock("@/lib/navigation", () => ({
  Link: ({
    href,
    children,
  }: {
    href: string
    children: React.ReactNode
  }) => <a href={href}>{children}</a>,
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    asChild,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) =>
    asChild ? <>{children}</> : <button {...rest}>{children}</button>,
}))

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: (...args: unknown[]) => toastMock(...args),
  }),
}))

vi.mock("@/lib/services/products-service", () => ({
  productsService: {
    getMyProducts: (...args: unknown[]) => getMyProductsMock(...args),
    delete: (...args: unknown[]) => deleteProductMock(...args),
  },
}))

function makeProducts(): Product[] {
  return [
    {
      id: "product-1",
      name: "Jarron azul",
      description: "Ceramica local",
      price: 12,
      stock: 3,
      city: "Sevilla",
      category: "Ceramica",
      providerId: "provider-1",
      createdAt: "2026-03-24T10:00:00.000Z",
      imageUrl: "https://img.test/jarron.jpg",
    },
  ]
}

describe("ProviderProductsPage", () => {
  beforeEach(() => {
    getMyProductsMock.mockReset()
    deleteProductMock.mockReset()
    toastMock.mockReset()
    vi.stubGlobal("confirm", vi.fn(() => true))
  })

  it("renders provider inventory cards after loading", async () => {
    getMyProductsMock.mockResolvedValue(makeProducts())

    render(<ProviderProductsPage />)

    await waitFor(() => {
      expect(screen.getByText("Inventario")).toBeInTheDocument()
      expect(screen.getByText("Jarron azul")).toBeInTheDocument()
    })

    expect(screen.getByText("Ceramica")).toBeInTheDocument()
    expect(screen.getByText("Sevilla")).toBeInTheDocument()
    expect(screen.getByText("12.00 €")).toBeInTheDocument()
    expect(screen.getByText(/Stock:/)).toBeInTheDocument()
  })

  it("shows the empty inventory state", async () => {
    getMyProductsMock.mockResolvedValue([])

    render(<ProviderProductsPage />)

    await waitFor(() => {
      expect(screen.getByText("No tienes productos")).toBeInTheDocument()
    })

    expect(screen.getByText(/Empieza añadiendo tu primer producto/i)).toBeInTheDocument()
  })

  it("deletes a product and reloads the inventory", async () => {
    getMyProductsMock.mockResolvedValue(makeProducts())
    deleteProductMock.mockResolvedValueOnce(undefined)

    render(<ProviderProductsPage />)

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Eliminar" })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }))

    await waitFor(() => {
      expect(deleteProductMock).toHaveBeenCalledWith("product-1")
      expect(toastMock).toHaveBeenCalledWith({
        title: "Producto eliminado",
        description: "El producto ha sido eliminado correctamente",
      })
      expect(getMyProductsMock.mock.calls.length).toBeGreaterThanOrEqual(2)
    })
  })

  it("shows a destructive toast when deleting fails", async () => {
    getMyProductsMock.mockResolvedValue(makeProducts())
    deleteProductMock.mockRejectedValueOnce(new Error("boom"))

    render(<ProviderProductsPage />)

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Eliminar" })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }))

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        title: "Error",
        description: "No se pudo eliminar el producto",
        variant: "destructive",
      })
    })
  })
})
