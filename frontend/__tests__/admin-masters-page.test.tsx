import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

const routerPushMock = vi.fn()
const toastMock = vi.fn()
const getCitiesMock = vi.fn()
const createCityMock = vi.fn()
const updateCityMock = vi.fn()
const deleteCityMock = vi.fn()
const getCategoriesMock = vi.fn()
const createCategoryMock = vi.fn()
const updateCategoryMock = vi.fn()
const deleteCategoryMock = vi.fn()

let currentTab = "cities"
const TabsContext = React.createContext<(value: string) => void>(() => undefined)

vi.mock("@/lib/navigation", () => ({
  useRouter: () => ({
    push: (...args: unknown[]) => routerPushMock(...args),
  }),
}))

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: (key: string) => (key === "tab" ? currentTab : null),
  }),
}))

vi.mock("@/lib/services/admin-service", () => ({
  adminService: {
    getCities: (...args: unknown[]) => getCitiesMock(...args),
    createCity: (...args: unknown[]) => createCityMock(...args),
    updateCity: (...args: unknown[]) => updateCityMock(...args),
    deleteCity: (...args: unknown[]) => deleteCityMock(...args),
    getCategories: (...args: unknown[]) => getCategoriesMock(...args),
    createCategory: (...args: unknown[]) => createCategoryMock(...args),
    updateCategory: (...args: unknown[]) => updateCategoryMock(...args),
    deleteCategory: (...args: unknown[]) => deleteCategoryMock(...args),
  },
}))

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({
    toast: (...args: unknown[]) => toastMock(...args),
  }),
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, asChild, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) =>
    asChild ? <>{children}</> : <button {...rest}>{children}</button>,
}))

vi.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))

vi.mock("@/components/ui/label", () => ({
  Label: ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => (
    <label htmlFor={htmlFor}>{children}</label>
  ),
}))

vi.mock("@/components/ui/switch", () => ({
  Switch: ({
    checked,
    onCheckedChange,
    id,
  }: {
    checked?: boolean
    onCheckedChange?: (value: boolean) => void
    id?: string
  }) => (
    <input
      id={id}
      type="checkbox"
      checked={checked}
      onChange={(event) => onCheckedChange?.(event.currentTarget.checked)}
    />
  ),
}))

vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({
    children,
    onValueChange,
  }: {
    children: React.ReactNode
    onValueChange?: (value: string) => void
  }) => (
    <TabsContext.Provider value={onValueChange ?? (() => undefined)}>
      <div>{children}</div>
    </TabsContext.Provider>
  ),
  TabsList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({
    children,
    value,
  }: {
    children: React.ReactNode
    value: string
  }) => (
    <TabsContext.Consumer>
      {(onValueChange) => (
        <button type="button" onClick={() => onValueChange(value)} data-value={value}>
          {children}
        </button>
      )}
    </TabsContext.Consumer>
  ),
  TabsContent: ({ children, value }: { children: React.ReactNode; value: string }) =>
    value === currentTab ? <div>{children}</div> : null,
}))

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h3>{children}</h3>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock("@/components/ui/table", () => ({
  Table: ({ children }: { children: React.ReactNode }) => <table>{children}</table>,
  TableHeader: ({ children }: { children: React.ReactNode }) => <thead>{children}</thead>,
  TableBody: ({ children }: { children: React.ReactNode }) => <tbody>{children}</tbody>,
  TableRow: ({ children }: { children: React.ReactNode }) => <tr>{children}</tr>,
  TableHead: ({ children }: { children: React.ReactNode }) => <th>{children}</th>,
  TableCell: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <td className={className}>{children}</td>
  ),
}))

describe("Admin masters page", () => {
  beforeEach(() => {
    currentTab = "cities"
    routerPushMock.mockReset()
    toastMock.mockReset()
    getCitiesMock.mockReset()
    createCityMock.mockReset()
    updateCityMock.mockReset()
    deleteCityMock.mockReset()
    getCategoriesMock.mockReset()
    createCategoryMock.mockReset()
    updateCategoryMock.mockReset()
    deleteCategoryMock.mockReset()
    getCitiesMock.mockResolvedValue([])
    getCategoriesMock.mockResolvedValue([])
    vi.stubGlobal("confirm", vi.fn(() => true))
  })

  it("navigates between tabs and creates a city", async () => {
    getCitiesMock.mockImplementation(() =>
      Promise.resolve([
        { id: "city-1", name: "Madrid", slug: "madrid", active: true },
        { id: "city-2", name: "Toledo", slug: "toledo", active: true },
      ]),
    )
    createCityMock.mockResolvedValueOnce({})

    const Page = (await import("@/app/[locale]/admin/masters/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("Listado de Ciudades")).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText("Nombre"), {
      target: { value: "Toledo" },
    })
    fireEvent.change(screen.getByLabelText("Slug"), {
      target: { value: "toledo" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }))

    await waitFor(() => {
      expect(createCityMock).toHaveBeenCalledWith({
        name: "Toledo",
        slug: "toledo",
        active: true,
      })
    })

    expect(toastMock).toHaveBeenCalledWith({ title: "Ciudad creada" })
    expect(screen.getByText("Toledo")).toBeInTheDocument()
  })

  it("updates and deletes a category successfully", async () => {
    currentTab = "categories"
    getCitiesMock.mockResolvedValue([])
    getCategoriesMock.mockImplementation(() =>
      Promise.resolve([
        { id: "cat-1", name: "Cerámica", slug: "ceramica", image_url: "/img-1.jpg" },
      ]),
    )
    updateCategoryMock.mockImplementation(async () => {
      getCategoriesMock.mockImplementation(() =>
        Promise.resolve([
          { id: "cat-1", name: "Textil", slug: "textil", image_url: "/img-2.jpg" },
        ]),
      )
      return {}
    })
    deleteCategoryMock.mockImplementation(async () => {
      getCategoriesMock.mockImplementation(() => Promise.resolve([]))
      return {}
    })

    const Page = (await import("@/app/[locale]/admin/masters/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("Listado de Categorías")).toBeInTheDocument()
    })

    let iconButtons = screen.getAllByRole("button").filter((button) => button.textContent === "")
    fireEvent.click(iconButtons[0])
    fireEvent.change(screen.getByLabelText("Nombre"), {
      target: { value: "Textil" },
    })
    fireEvent.change(screen.getByLabelText("Slug"), {
      target: { value: "textil" },
    })
    fireEvent.change(screen.getByLabelText("Imagen URL"), {
      target: { value: "/img-2.jpg" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }))

    await waitFor(() => {
      expect(updateCategoryMock).toHaveBeenCalledWith("cat-1", {
        name: "Textil",
        slug: "textil",
        image_url: "/img-2.jpg",
      })
      expect(toastMock).toHaveBeenCalledWith({ title: "Categoría actualizada" })
      expect(screen.getByText("Textil")).toBeInTheDocument()
    })

    iconButtons = screen.getAllByRole("button").filter((button) => button.textContent === "")
    fireEvent.click(iconButtons[1])

    await waitFor(() => {
      expect(deleteCategoryMock).toHaveBeenCalledWith("cat-1")
      expect(toastMock).toHaveBeenCalledWith({ title: "Categoría eliminada" })
    })
  })

  it("surfaces category save and delete failures", async () => {
    currentTab = "categories"
    getCitiesMock.mockResolvedValue([])
    getCategoriesMock.mockImplementation(() =>
      Promise.resolve([
        { id: "cat-1", name: "Cerámica", slug: "ceramica", image_url: "/img-1.jpg" },
      ]),
    )
    createCategoryMock.mockRejectedValueOnce(new Error("boom"))
    deleteCategoryMock.mockRejectedValueOnce(new Error("still-related"))

    const Page = (await import("@/app/[locale]/admin/masters/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("Listado de Categorías")).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText("Nombre"), {
      target: { value: "Fallará" },
    })
    fireEvent.change(screen.getByLabelText("Slug"), {
      target: { value: "fallara" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }))

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        title: "Error al guardar",
        variant: "destructive",
      })
    })

    let iconButtons = screen.getAllByRole("button").filter((button) => button.textContent === "")
    fireEvent.click(iconButtons[1])

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        title: "Error al eliminar",
        variant: "destructive",
      })
    })
  })

  it("pushes the router when switching tabs and supports city edit/delete flows", async () => {
    getCitiesMock.mockImplementation(() =>
      Promise.resolve([{ id: "city-1", name: "Madrid", slug: "madrid", active: true }]),
    )
    updateCityMock.mockImplementation(async () => {
      getCitiesMock.mockResolvedValueOnce([
        { id: "city-1", name: "Madrid Norte", slug: "madrid-norte", active: true },
      ])
      return {}
    })
    deleteCityMock.mockImplementation(async () => {
      getCitiesMock.mockResolvedValueOnce([])
      return {}
    })

    const Page = (await import("@/app/[locale]/admin/masters/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("Listado de Ciudades")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: "Categorías" }))
    expect(routerPushMock).toHaveBeenCalledWith("/admin/masters?tab=categories")

    const iconButtons = screen.getAllByRole("button").filter((button) => button.textContent === "")
    fireEvent.click(iconButtons[0])
    fireEvent.change(screen.getByLabelText("Nombre"), {
      target: { value: "Madrid Norte" },
    })
    fireEvent.change(screen.getByLabelText("Slug"), {
      target: { value: "madrid-norte" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }))

    await waitFor(() => {
      expect(updateCityMock).toHaveBeenCalledWith("city-1", {
        name: "Madrid Norte",
        slug: "madrid-norte",
        active: true,
      })
      expect(toastMock).toHaveBeenCalledWith({ title: "Ciudad actualizada" })
    })

    fireEvent.click(screen.getAllByRole("button").filter((button) => button.textContent === "")[1])

    await waitFor(() => {
      expect(deleteCityMock).toHaveBeenCalledWith("city-1")
      expect(toastMock).toHaveBeenCalledWith({ title: "Ciudad eliminada" })
    })
  })
})
