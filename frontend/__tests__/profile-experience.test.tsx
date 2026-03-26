import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

const useAuthMock = vi.fn()
const requestRoleMock = vi.fn()
const toastSuccessMock = vi.fn()
const toastErrorMock = vi.fn()

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
    post: vi.fn(),
  },
}))

describe("Profile role request experience", () => {
  beforeEach(() => {
    requestRoleMock.mockReset()
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
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
})
