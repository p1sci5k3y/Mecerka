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
const getEmailSettingsMock = vi.fn()
const updateEmailSettingsMock = vi.fn()
const sendEmailSettingsTestMock = vi.fn()

let currentTab = "cities"
const TabsContext = React.createContext<{
  onValueChange: (value: string) => void
  activeValue: string
}>({
  onValueChange: () => undefined,
  activeValue: "cities",
})

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
    getEmailSettings: (...args: unknown[]) => getEmailSettingsMock(...args),
    updateEmailSettings: (...args: unknown[]) => updateEmailSettingsMock(...args),
    sendEmailSettingsTest: (...args: unknown[]) => sendEmailSettingsTestMock(...args),
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
    value,
    onValueChange,
  }: {
    children: React.ReactNode
    value?: string
    onValueChange?: (value: string) => void
  }) => (
    <TabsContext.Provider
      value={{
        onValueChange: onValueChange ?? (() => undefined),
        activeValue: value ?? "cities",
      }}
    >
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
      {({ onValueChange }) => (
        <button type="button" onClick={() => onValueChange(value)} data-value={value}>
          {children}
        </button>
      )}
    </TabsContext.Consumer>
  ),
  TabsContent: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <TabsContext.Consumer>
      {({ activeValue }) => (value === activeValue ? <div>{children}</div> : null)}
    </TabsContext.Consumer>
  ),
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
    getEmailSettingsMock.mockReset()
    updateEmailSettingsMock.mockReset()
    sendEmailSettingsTestMock.mockReset()
    getCitiesMock.mockResolvedValue([])
    getCategoriesMock.mockResolvedValue([])
    getEmailSettingsMock.mockResolvedValue({
      connectorType: "SMTP",
      connectorLabel: "SMTP",
      source: "database",
      configured: true,
      senderConfigured: true,
      credentialsConfigured: true,
      secretConfigured: true,
      transportSecurity: "TLS_VERIFIED",
    })
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

  it("opens category editing with optional fields blank and avoids destructive calls when confirm is cancelled", async () => {
    currentTab = "categories"
    getCategoriesMock.mockResolvedValue([
      { id: "cat-1", name: "Cerámica", slug: undefined, image_url: undefined },
    ])
    ;(globalThis.confirm as ReturnType<typeof vi.fn>).mockReturnValueOnce(false)

    const Page = (await import("@/app/[locale]/admin/masters/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("Listado de Categorías")).toBeInTheDocument()
    })

    const iconButtons = screen.getAllByRole("button").filter((button) => button.textContent === "")
    fireEvent.click(iconButtons[0])

    expect(screen.getByLabelText("Slug")).toHaveValue("")
    expect(screen.getByLabelText("Imagen URL")).toHaveValue("")

    fireEvent.click(iconButtons[1])

    expect(deleteCategoryMock).not.toHaveBeenCalled()
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

  it("updates smtp settings and sends a test email from the email tab", async () => {
    currentTab = "email"
    updateEmailSettingsMock.mockResolvedValue({})
    sendEmailSettingsTestMock.mockResolvedValue({ ok: true })

    const Page = (await import("@/app/[locale]/admin/masters/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("Conectores de correo")).toBeInTheDocument()
    })

    expect(screen.queryByLabelText("Host SMTP")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Reconfigurar conexión" }))

    fireEvent.change(screen.getByLabelText("Host SMTP"), {
      target: { value: "email-smtp.eu-west-1.amazonaws.com" },
    })
    fireEvent.change(screen.getByLabelText("Puerto SMTP"), {
      target: { value: "465" },
    })
    fireEvent.change(screen.getByLabelText("Usuario SMTP"), {
      target: { value: "ses-user" },
    })
    fireEvent.change(screen.getByLabelText("Secreto SMTP"), {
      target: { value: "ses-pass" },
    })
    fireEvent.change(screen.getByLabelText("Remitente"), {
      target: { value: "no-reply@mecerka.me" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Guardar conector SMTP" }))

    await waitFor(() => {
      expect(updateEmailSettingsMock).toHaveBeenCalledWith({
        connectorType: "SMTP",
        host: "email-smtp.eu-west-1.amazonaws.com",
        port: 465,
        user: "ses-user",
        password: "ses-pass",
        clearSecret: false,
        from: "no-reply@mecerka.me",
      })
    })

    fireEvent.change(screen.getByLabelText("Destinatario"), {
      target: { value: "ops@example.com" },
    })
    fireEvent.click(screen.getByRole("button", { name: /Enviar correo de prueba/i }))

    await waitFor(() => {
      expect(sendEmailSettingsTestMock).toHaveBeenCalledWith("ops@example.com")
    })
  })

  it("saves smtp settings without exposing or forcing an smtp username", async () => {
    currentTab = "email"
    updateEmailSettingsMock.mockResolvedValue({})

    const Page = (await import("@/app/[locale]/admin/masters/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("Conectores de correo")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: "Reconfigurar conexión" }))

    fireEvent.change(screen.getByLabelText("Host SMTP"), {
      target: { value: "smtp.internal.local" },
    })
    fireEvent.change(screen.getByLabelText("Puerto SMTP"), {
      target: { value: "1025" },
    })
    fireEvent.change(screen.getByLabelText("Secreto SMTP"), {
      target: { value: "local-secret" },
    })
    fireEvent.change(screen.getByLabelText("Remitente"), {
      target: { value: "local@example.com" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Guardar conector SMTP" }))

    await waitFor(() => {
      expect(updateEmailSettingsMock).toHaveBeenCalledWith({
        connectorType: "SMTP",
        host: "smtp.internal.local",
        port: 1025,
        user: undefined,
        password: "local-secret",
        clearSecret: false,
        from: "local@example.com",
      })
    })
  })

  it("allows switching to aws ses and saves that connector without exposing stored secrets", async () => {
    currentTab = "email"
    getEmailSettingsMock.mockResolvedValue({
      connectorType: "AWS_SES",
      connectorLabel: "AWS SES",
      source: "database",
      configured: true,
      senderConfigured: true,
      credentialsConfigured: true,
      secretConfigured: true,
      transportSecurity: "TLS_VERIFIED",
    })
    updateEmailSettingsMock.mockResolvedValue({})

    const Page = (await import("@/app/[locale]/admin/masters/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("Conector activo")).toBeInTheDocument()
    })

    expect(screen.queryByDisplayValue("AKIA_TEST")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Reconfigurar conexión" }))
    fireEvent.click(screen.getByRole("button", { name: "AWS SES" }))
    fireEvent.change(screen.getByLabelText("Region AWS"), {
      target: { value: "eu-west-1" },
    })
    fireEvent.change(screen.getByLabelText("Access Key ID"), {
      target: { value: "AKIA_TEST" },
    })
    fireEvent.change(screen.getByLabelText("Secret Access Key"), {
      target: { value: "ses-secret" },
    })
    fireEvent.change(screen.getByLabelText("Session Token (opcional)"), {
      target: { value: "session-token" },
    })
    fireEvent.change(screen.getByLabelText("Endpoint personalizado (opcional)"), {
      target: { value: "https://email.eu-west-1.amazonaws.com" },
    })
    fireEvent.change(screen.getByLabelText("Remitente verificado"), {
      target: { value: "support@mecerka.me" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Guardar conector AWS SES" }))

    await waitFor(() => {
      expect(updateEmailSettingsMock).toHaveBeenCalledWith({
        connectorType: "AWS_SES",
        region: "eu-west-1",
        accessKeyId: "AKIA_TEST",
        secretAccessKey: "ses-secret",
        sessionToken: "session-token",
        endpoint: "https://email.eu-west-1.amazonaws.com",
        clearSecret: false,
        clearSessionToken: false,
        from: "support@mecerka.me",
      })
    })

    fireEvent.click(screen.getByRole("button", { name: "Reconfigurar conexión" }))

    expect(screen.getByLabelText("Secret Access Key")).toHaveAttribute("placeholder", "Configurado")
    expect(screen.getByLabelText("Session Token (opcional)")).toHaveAttribute("placeholder", "Opcional")
  })

  it("surfaces aws ses save failures, supports clearing persisted aws secrets and lets operators switch back to smtp", async () => {
    currentTab = "email"
    getEmailSettingsMock.mockResolvedValue({
      connectorType: "AWS_SES",
      connectorLabel: "AWS SES",
      source: "environment",
      configured: true,
      senderConfigured: true,
      credentialsConfigured: true,
      secretConfigured: true,
      transportSecurity: "TLS_VERIFIED",
    })
    updateEmailSettingsMock.mockRejectedValueOnce(new Error("aws ses save failed"))

    const Page = (await import("@/app/[locale]/admin/masters/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.queryByText("Base de datos cifrada")).not.toBeInTheDocument()
      expect(screen.getByText("Variables de entorno")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: "Añadir conexión nueva" }))
    fireEvent.click(screen.getByRole("button", { name: "AWS SES" }))
    fireEvent.change(screen.getByLabelText("Region AWS"), {
      target: { value: "eu-west-1" },
    })
    fireEvent.change(screen.getByLabelText("Access Key ID"), {
      target: { value: "AKIA_NEXT" },
    })
    fireEvent.change(screen.getByLabelText("Remitente verificado"), {
      target: { value: "support@mecerka.me" },
    })
    fireEvent.click(screen.getByLabelText("Borrar el secreto AWS guardado"))
    fireEvent.click(screen.getByLabelText("Borrar el session token guardado"))
    fireEvent.click(screen.getByRole("button", { name: "Guardar conector AWS SES" }))

    await waitFor(() => {
      expect(updateEmailSettingsMock).toHaveBeenCalledWith({
        connectorType: "AWS_SES",
        region: "eu-west-1",
        accessKeyId: "AKIA_NEXT",
        secretAccessKey: undefined,
        sessionToken: undefined,
        endpoint: undefined,
        clearSecret: true,
        clearSessionToken: true,
        from: "support@mecerka.me",
      })
      expect(toastMock).toHaveBeenCalledWith({
        title: "Error al guardar el conector AWS SES",
        variant: "destructive",
      })
    })

    fireEvent.click(screen.getByRole("button", { name: "Nueva conexión SMTP" }))
    expect(screen.getByLabelText("Host SMTP")).toBeInTheDocument()
  })

  it("keeps the connector form hidden until an operator explicitly starts a new setup", async () => {
    currentTab = "email"

    const Page = (await import("@/app/[locale]/admin/masters/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("Conectores de correo")).toBeInTheDocument()
    })

    expect(screen.getByText("Conector activo")).toBeInTheDocument()
    expect(screen.queryByLabelText("Host SMTP")).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Region AWS")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Reconfigurar conexión" }))

    expect(screen.getByLabelText("Host SMTP")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Cancelar edición" }))

    expect(screen.queryByLabelText("Host SMTP")).not.toBeInTheDocument()
  })

  it("falls back to the cities tab by default and covers smtp status variants", async () => {
    currentTab = ""
    getCitiesMock.mockResolvedValue([{ id: "city-1", name: "Madrid", slug: undefined, active: true }])
    getCategoriesMock.mockResolvedValue([{ id: "cat-1", name: "Cerámica", slug: undefined, image_url: undefined }])
    getEmailSettingsMock.mockResolvedValue({
      connectorType: "SMTP",
      connectorLabel: "SMTP",
      source: "default",
      configured: true,
      senderConfigured: true,
      credentialsConfigured: false,
      secretConfigured: false,
      transportSecurity: "LOCAL_DEFAULT",
    })

    const Page = (await import("@/app/[locale]/admin/masters/page")).default
    const { rerender } = render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("Listado de Ciudades")).toBeInTheDocument()
    })

    currentTab = "email"
    rerender(<Page />)

    await waitFor(() => {
      expect(screen.getByText("Conectores de correo")).toBeInTheDocument()
    })

    expect(screen.getByText("Default local")).toBeInTheDocument()
    expect(screen.getByText("Relay local de desarrollo")).toBeInTheDocument()
    expect(screen.getByText("No configuradas")).toBeInTheDocument()
    expect(screen.getByText(/^No$/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Añadir conexión nueva" }))
    expect(screen.getByLabelText("Secreto SMTP")).toHaveAttribute("placeholder", "")
  })

  it("surfaces connector load, save and test failures and can clear the stored smtp secret", async () => {
    currentTab = "email"
    getEmailSettingsMock
      .mockRejectedValueOnce(new Error("smtp down"))
      .mockResolvedValueOnce({
        connectorType: "SMTP",
        connectorLabel: "SMTP",
        source: "environment",
        configured: true,
        senderConfigured: true,
        credentialsConfigured: true,
        secretConfigured: true,
        transportSecurity: "TLS_VERIFIED",
      })
    updateEmailSettingsMock.mockRejectedValueOnce(new Error("save failed"))
    sendEmailSettingsTestMock.mockRejectedValueOnce(new Error("test failed"))

    const Page = (await import("@/app/[locale]/admin/masters/page")).default
    const { rerender } = render(<Page />)

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        title: "Error al cargar la configuración de correo",
        variant: "destructive",
      })
    })

    rerender(<Page />)

    await waitFor(() => {
      expect(screen.getByText("Conectores de correo")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: "Reconfigurar conexión" }))

    fireEvent.change(screen.getByLabelText("Host SMTP"), {
      target: { value: "email-smtp.eu-west-1.amazonaws.com" },
    })
    fireEvent.change(screen.getByLabelText("Puerto SMTP"), {
      target: { value: "587" },
    })
    fireEvent.change(screen.getByLabelText("Usuario SMTP"), {
      target: { value: "smtp-user" },
    })
    fireEvent.change(screen.getByLabelText("Remitente"), {
      target: { value: "no-reply@example.com" },
    })
    fireEvent.click(screen.getByLabelText("Borrar el secreto SMTP guardado"))
    fireEvent.click(screen.getByRole("button", { name: "Guardar conector SMTP" }))

    await waitFor(() => {
      expect(updateEmailSettingsMock).toHaveBeenCalledWith({
        connectorType: "SMTP",
        host: "email-smtp.eu-west-1.amazonaws.com",
        port: 587,
        user: "smtp-user",
        password: undefined,
        clearSecret: true,
        from: "no-reply@example.com",
      })
      expect(toastMock).toHaveBeenCalledWith({
        title: "Error al guardar el conector SMTP",
        variant: "destructive",
      })
    })

    fireEvent.change(screen.getByLabelText("Destinatario"), {
      target: { value: "ops@example.com" },
    })
    fireEvent.click(screen.getByRole("button", { name: /Enviar correo de prueba/i }))

    await waitFor(() => {
      expect(sendEmailSettingsTestMock).toHaveBeenCalledWith("ops@example.com")
      expect(toastMock).toHaveBeenCalledWith({
        title: "Error al enviar el correo de prueba",
        variant: "destructive",
      })
    })
  })
})
