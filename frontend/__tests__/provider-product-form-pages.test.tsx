import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

const routerPushMock = vi.fn()
const createMock = vi.fn()
const updateMock = vi.fn()
const apiGetMock = vi.fn()
const toastMock = vi.fn()
const useParamsMock = vi.fn()

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
  useRouter: () => ({
    push: routerPushMock,
  }),
  Link: ({
    href,
    children,
  }: {
    href: string
    children: React.ReactNode
  }) => <a href={href}>{children}</a>,
}))

vi.mock("next/navigation", () => ({
  useParams: () => useParamsMock(),
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    asChild,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) =>
    asChild ? <>{children}</> : <button {...rest}>{children}</button>,
}))

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
}))

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: (...args: unknown[]) => toastMock(...args),
  }),
}))

vi.mock("@/lib/api", () => ({
  api: {
    get: (...args: unknown[]) => apiGetMock(...args),
  },
}))

vi.mock("@/lib/services/products-service", () => ({
  productsService: {
    create: (...args: unknown[]) => createMock(...args),
    update: (...args: unknown[]) => updateMock(...args),
  },
}))

function fillCommonFields() {
  fireEvent.change(screen.getByLabelText("Nombre del producto *"), {
    target: { value: "Jarron premium" },
  })
  fireEvent.change(screen.getByLabelText("Descripción"), {
    target: { value: "Ceramica esmaltada" },
  })
  fireEvent.change(screen.getByLabelText("Precio (€) *"), {
    target: { value: "19.5" },
  })
  fireEvent.change(screen.getByLabelText("Stock (unidades) *"), {
    target: { value: "6" },
  })
  fireEvent.change(screen.getByLabelText("URL de la imagen"), {
    target: { value: "https://img.test/jarron.jpg" },
  })
}

describe("Provider product form pages", () => {
  beforeEach(() => {
    routerPushMock.mockReset()
    createMock.mockReset()
    updateMock.mockReset()
    apiGetMock.mockReset()
    toastMock.mockReset()
    useParamsMock.mockReset()
    useParamsMock.mockReturnValue({ id: "product-1" })
  })

  it("creates a product and redirects back to inventory", async () => {
    apiGetMock.mockImplementation(async () => [])
    createMock.mockResolvedValueOnce(undefined)

    const Page = (await import("@/app/[locale]/provider/products/new/page")).default
    render(<Page />)

    fillCommonFields()
    fireEvent.submit(screen.getByRole("button", { name: "Guardar Producto" }).closest("form")!)

    await waitFor(() => {
      expect(createMock).toHaveBeenCalledWith({
        name: "Jarron premium",
        description: "Ceramica esmaltada",
        price: 19.5,
        stock: 6,
        categoryId: "",
        cityId: "",
        imageUrl: "https://img.test/jarron.jpg",
      })
      expect(toastMock).toHaveBeenCalledWith({
        title: "Producto creado",
        description: "El producto se ha guardado correctamente",
      })
      expect(routerPushMock).toHaveBeenCalledWith("/provider/products")
    })
  })

  it("shows a destructive toast when creating a product fails", async () => {
    apiGetMock.mockImplementation(async () => [])
    createMock.mockRejectedValueOnce(new Error("boom"))

    const Page = (await import("@/app/[locale]/provider/products/new/page")).default
    render(<Page />)

    fillCommonFields()
    fireEvent.submit(screen.getByRole("button", { name: "Guardar Producto" }).closest("form")!)

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        title: "Error",
        description: "No se pudo crear el producto. Verifica los datos.",
        variant: "destructive",
      })
    })
  })

  it("loads an existing product, updates it and redirects to inventory", async () => {
    apiGetMock.mockImplementation(async (endpoint: string) => {
      if (endpoint === "/cities") {
        return [{ id: "city-1", name: "Sevilla", slug: "sevilla" }]
      }
      if (endpoint === "/categories") {
        return [{ id: "cat-1", name: "Ceramica", slug: "ceramica" }]
      }
      if (endpoint === "/products/product-1") {
        return {
          id: "product-1",
          name: "Jarron inicial",
          description: "Desc inicial",
          price: "10.00",
          stock: 4,
          categoryId: "cat-1",
          cityId: "city-1",
          imageUrl: "",
        }
      }
      return []
    })
    updateMock.mockResolvedValueOnce(undefined)

    const Page = (await import("@/app/[locale]/provider/products/[id]/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByDisplayValue("Jarron inicial")).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText("Nombre del producto *"), {
      target: { value: "Jarron editado" },
    })
    fireEvent.change(screen.getByLabelText("Precio (€) *"), {
      target: { value: "14.25" },
    })
    fireEvent.change(screen.getByLabelText("Stock (unidades) *"), {
      target: { value: "9" },
    })

    fireEvent.submit(screen.getByRole("button", { name: "Guardar Cambios" }).closest("form")!)

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith("product-1", {
        name: "Jarron editado",
        description: "Desc inicial",
        price: 14.25,
        stock: 9,
        categoryId: "cat-1",
        cityId: "city-1",
        imageUrl: "",
      })
      expect(toastMock).toHaveBeenCalledWith({
        title: "Producto actualizado",
        description: "Los cambios se han guardado correctamente",
      })
      expect(routerPushMock).toHaveBeenCalledWith("/provider/products")
    })
  })

  it("redirects safely when editing data cannot be loaded", async () => {
    apiGetMock.mockImplementation(async (endpoint: string) => {
      if (endpoint === "/cities") {
        return [{ id: "city-1", name: "Sevilla", slug: "sevilla" }]
      }
      if (endpoint === "/categories") {
        return [{ id: "cat-1", name: "Ceramica", slug: "ceramica" }]
      }
      if (endpoint === "/products/product-1") {
        throw new Error("missing")
      }
      return []
    })

    const Page = (await import("@/app/[locale]/provider/products/[id]/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        title: "Error",
        description: "No se pudo cargar la información del producto",
        variant: "destructive",
      })
      expect(routerPushMock).toHaveBeenCalledWith("/provider/products")
    })
  })
})
