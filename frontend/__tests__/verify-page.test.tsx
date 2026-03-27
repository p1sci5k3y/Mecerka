import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"

const searchParamsGetMock = vi.fn()
const verifyEmailMock = vi.fn()

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: searchParamsGetMock,
  }),
}))

vi.mock("@/lib/services/auth-service", () => ({
  authService: {
    verifyEmail: (...args: unknown[]) => verifyEmailMock(...args),
  },
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

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    asChild,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) =>
    asChild ? <>{children}</> : <button {...rest}>{children}</button>,
}))

describe("VerifyEmailPage", () => {
  beforeEach(() => {
    searchParamsGetMock.mockReset()
    verifyEmailMock.mockReset()
  })

  it("shows an invalid-link state when the token is missing", async () => {
    searchParamsGetMock.mockReturnValue(null)

    const { default: VerifyEmailPage } = await import("@/app/[locale]/verify/page")
    render(<VerifyEmailPage />)

    expect(screen.getByText("Error de Verificación")).toBeInTheDocument()
    expect(
      screen.getByText("Enlace inválido o sin token de verificación."),
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Ir a Iniciar Sesión" })).toHaveAttribute(
      "href",
      "/login",
    )
  })

  it("verifies the account successfully", async () => {
    searchParamsGetMock.mockImplementation((key: string) =>
      key === "token" ? "valid-token" : null,
    )
    verifyEmailMock.mockResolvedValue({})

    const { default: VerifyEmailPage } = await import("@/app/[locale]/verify/page")
    render(<VerifyEmailPage />)

    await waitFor(() => {
      expect(verifyEmailMock).toHaveBeenCalledWith("valid-token")
    })
    expect(screen.getByText("¡Cuenta Activada!")).toBeInTheDocument()
    expect(
      screen.getByText("Tu cuenta ha sido verificada correctamente. Ya puedes iniciar sesión."),
    ).toBeInTheDocument()
  })

  it("shows the backend verification error when the token is invalid", async () => {
    searchParamsGetMock.mockImplementation((key: string) =>
      key === "token" ? "expired-token" : null,
    )
    verifyEmailMock.mockRejectedValue({ message: "Enlace expirado" })

    const { default: VerifyEmailPage } = await import("@/app/[locale]/verify/page")
    render(<VerifyEmailPage />)

    await waitFor(() => {
      expect(verifyEmailMock).toHaveBeenCalledWith("expired-token")
    })
    expect(screen.getByText("Error de Verificación")).toBeInTheDocument()
    expect(screen.getByText("Enlace expirado")).toBeInTheDocument()
  })
})
