import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

const useAuthMock = vi.fn()
const requestRoleMock = vi.fn()
const toastSuccessMock = vi.fn()
const toastErrorMock = vi.fn()
const apiPostMock = vi.fn()

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => useAuthMock(),
}))

vi.mock("@/lib/services/users-service", () => ({
  usersService: {
    requestRole: (...args: unknown[]) => requestRoleMock(...args),
  },
}))

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}))

vi.mock("@/components/navbar", () => ({
  Navbar: () => <nav data-testid="navbar" />,
}))

vi.mock("@/components/footer", () => ({
  Footer: () => <footer data-testid="footer" />,
}))

vi.mock("@/components/protected-route", () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    asChild,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) =>
    asChild ? <>{children}</> : <button {...rest}>{children}</button>,
}))

vi.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))

vi.mock("@/components/ui/label", () => ({
  Label: ({
    children,
    ...rest
  }: React.LabelHTMLAttributes<HTMLLabelElement>) => <label {...rest}>{children}</label>,
}))

vi.mock("@/components/ui/tag-chip", () => ({
  TagChip: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

vi.mock("@/components/ui/seal-badge", () => ({
  SealBadge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

vi.mock("@/components/ui/section-header", () => ({
  SectionHeader: ({ title, subtitle }: { title: string; subtitle: string }) => (
    <div>
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </div>
  ),
}))

vi.mock("@/lib/navigation", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock("@/lib/api", () => ({
  api: {
    post: (...args: unknown[]) => apiPostMock(...args),
  },
}))

describe("Profile role request experience", () => {
  beforeEach(() => {
    requestRoleMock.mockReset()
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
    apiPostMock.mockReset()
  })

  it("shows only the missing requestable role and submits it with fiscal metadata", async () => {
    useAuthMock.mockReturnValue({
      user: {
        userId: "client-1",
        name: "Sofia Alva",
        email: "sofia@example.com",
        roles: ["CLIENT", "RUNNER"],
        mfaEnabled: true,
        hasPin: true,
      },
    })
    requestRoleMock.mockResolvedValueOnce({
      message: "Solicitud enviada",
    })

    const reloadSpy = vi.fn()
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { reload: reloadSpy },
    })

    const Page = (await import("@/app/[locale]/profile/page")).default
    render(<Page />)

    expect(screen.getByText("Cliente")).toBeInTheDocument()
    expect(screen.getByText("Repartidor")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Abrir centro de pagos" })).toHaveAttribute(
      "href",
      "/profile/payments",
    )
    expect(screen.getByRole("link", { name: "Abrir centro de soporte" })).toHaveAttribute(
      "href",
      "/profile/support",
    )

    const roleSelect = screen.getByLabelText("Rol solicitado") as HTMLSelectElement
    expect(roleSelect.value).toBe("PROVIDER")
    expect(screen.getByRole("option", { name: "Solicitar alta como proveedor" })).toBeInTheDocument()
    expect(
      screen.queryByRole("option", { name: "Solicitar licencia de repartidor" }),
    ).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("Identificador fiscal"), {
      target: { value: "12345678Z" },
    })
    fireEvent.click(
      screen.getByRole("button", { name: "Solicitar alta como proveedor" }),
    )

    await waitFor(() => {
      expect(requestRoleMock).toHaveBeenCalledWith({
        role: "PROVIDER",
        country: "ES",
        fiscalId: "12345678Z",
      })
    })
    expect(toastSuccessMock).toHaveBeenCalledWith("Solicitud enviada")
  })

  it("switches the requested role when runner is the only remaining requestable role", async () => {
    useAuthMock.mockReturnValue({
      user: {
        userId: "provider-1",
        name: "Sofia Alva",
        email: "sofia@example.com",
        roles: ["CLIENT", "PROVIDER"],
        mfaEnabled: true,
        hasPin: true,
      },
    })

    const Page = (await import("@/app/[locale]/profile/page")).default
    render(<Page />)

    const roleSelect = screen.getByLabelText("Rol solicitado") as HTMLSelectElement
    expect(roleSelect.value).toBe("RUNNER")
    expect(
      screen.queryByRole("option", { name: "Solicitar alta como proveedor" }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("option", { name: "Solicitar licencia de repartidor" }),
    ).toBeInTheDocument()
  })

  it("shows completion state when the user already has every requestable role", async () => {
    useAuthMock.mockReturnValue({
      user: {
        userId: "maker-1",
        name: "Alex Rivera",
        email: "alex@example.com",
        roles: ["CLIENT", "PROVIDER", "RUNNER"],
        mfaEnabled: true,
        hasPin: true,
      },
    })

    const Page = (await import("@/app/[locale]/profile/page")).default
    render(<Page />)

    expect(
      screen.getByText(/Ya dispones de todos los roles solicitables en la plataforma/i),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText("Rol solicitado")).not.toBeInTheDocument()
  })

  it("surfaces MFA-specific denial when requesting an extra role without a verified session", async () => {
    useAuthMock.mockReturnValue({
      user: {
        userId: "client-1",
        name: "Sofia Alva",
        email: "sofia@example.com",
        roles: ["CLIENT"],
        mfaEnabled: true,
        hasPin: true,
      },
    })
    requestRoleMock.mockRejectedValueOnce({
      message: "MFA required",
      statusCode: 403,
    })

    const Page = (await import("@/app/[locale]/profile/page")).default
    render(<Page />)

    fireEvent.change(screen.getByLabelText("Identificador fiscal"), {
      target: { value: "12345678Z" },
    })
    fireEvent.click(
      screen.getByRole("button", { name: "Solicitar alta como proveedor" }),
    )

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "Debes completar la verificación MFA de esta sesión antes de solicitar un rol.",
      )
    })
  })

  it("configures the transaction pin and links MFA setup when the account is not protected yet", async () => {
    useAuthMock.mockReturnValue({
      user: {
        userId: "client-2",
        name: "Mario Doe",
        email: "mario@example.com",
        roles: ["CLIENT"],
        mfaEnabled: false,
        hasPin: false,
      },
    })
    apiPostMock.mockResolvedValueOnce({ message: "ok" })

    const reloadSpy = vi.fn()
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { reload: reloadSpy },
    })

    const Page = (await import("@/app/[locale]/profile/page")).default
    render(<Page />)

    expect(screen.getByRole("link", { name: "Configurar" })).toHaveAttribute(
      "href",
      "/mfa/setup",
    )

    fireEvent.change(screen.getByLabelText("Nuevo PIN Transaccional"), {
      target: { value: "1234" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Guardar PIN" }))

    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledWith("/users/pin", { pin: "1234" })
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "PIN transaccional configurado correctamente. Ya puedes realizar pedidos.",
        { icon: "🔐" },
      )
    })
  })

  it("validates short pins and surfaces request-role API errors by status", async () => {
    useAuthMock.mockReturnValue({
      user: {
        userId: "client-3",
        name: "Marta Doe",
        email: "marta@example.com",
        roles: ["CLIENT"],
        mfaEnabled: true,
        hasPin: true,
      },
    })

    const Page = (await import("@/app/[locale]/profile/page")).default
    const { rerender } = render(<Page />)

    fireEvent.change(screen.getByLabelText("Cifrar Nuevo PIN"), {
      target: { value: "12" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Actualizar PIN" }))
    expect(toastErrorMock).toHaveBeenCalledWith("El PIN debe tener entre 4 y 6 números.")
    expect(apiPostMock).not.toHaveBeenCalled()

    requestRoleMock.mockRejectedValueOnce({
      message: "Sesion caducada",
      statusCode: 401,
    })
    fireEvent.change(screen.getByLabelText("Identificador fiscal"), {
      target: { value: "12345678Z" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Solicitar alta como proveedor" }))
    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "Tu sesión ha caducado. Vuelve a iniciar sesión.",
      )
    })

    requestRoleMock.mockRejectedValueOnce({
      message: "Fiscal inválido",
      statusCode: 400,
    })
    rerender(<Page />)
    fireEvent.change(screen.getByLabelText("Identificador fiscal"), {
      target: { value: "BAD" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Solicitar alta como proveedor" }))
    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("Fiscal inválido")
    })

    requestRoleMock.mockRejectedValueOnce(new Error("offline"))
    rerender(<Page />)
    fireEvent.change(screen.getByLabelText("Identificador fiscal"), {
      target: { value: "12345678Z" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Solicitar alta como proveedor" }))
    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("No se pudo tramitar la solicitud de rol.")
    })
  })

  it("surfaces pin setup API errors without reloading the profile", async () => {
    useAuthMock.mockReturnValue({
      user: {
        userId: "client-4",
        name: "Pilar Doe",
        email: "pilar@example.com",
        roles: ["CLIENT"],
        mfaEnabled: true,
        hasPin: false,
      },
    })
    apiPostMock.mockRejectedValueOnce(new Error("pin failed"))

    const reloadSpy = vi.fn()
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { reload: reloadSpy },
    })

    const Page = (await import("@/app/[locale]/profile/page")).default
    render(<Page />)

    fireEvent.change(screen.getByLabelText("Nuevo PIN Transaccional"), {
      target: { value: "1234" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Guardar PIN" }))

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("pin failed")
    })
    expect(reloadSpy).not.toHaveBeenCalled()
  })
})
