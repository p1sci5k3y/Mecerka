import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

const useAuthMock = vi.fn()
const pushMock = vi.fn()
const generateMfaEmailOtpMock = vi.fn()
const setupMfaMock = vi.fn()
const verifyMfaMock = vi.fn()
const toastSuccessMock = vi.fn()
const toastErrorMock = vi.fn()

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => useAuthMock(),
}))

vi.mock("@/lib/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}))

vi.mock("@/lib/services/auth-service", () => ({
  authService: {
    generateMfaEmailOtp: (...args: unknown[]) => generateMfaEmailOtpMock(...args),
    setupMfa: (...args: unknown[]) => setupMfaMock(...args),
    verifyMfa: (...args: unknown[]) => verifyMfaMock(...args),
  },
}))

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}))

vi.mock("next/image", () => ({
  default: ({ alt, ...rest }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <img alt={alt} {...rest} />
  ),
}))

describe("MfaSetupPage", () => {
  beforeEach(() => {
    useAuthMock.mockReset()
    pushMock.mockReset()
    generateMfaEmailOtpMock.mockReset()
    setupMfaMock.mockReset()
    verifyMfaMock.mockReset()
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
  })

  it("redirects guests to login", async () => {
    useAuthMock.mockReturnValue({
      user: null,
      logout: vi.fn(),
      isLoading: false,
    })

    const { default: MfaSetupPage } = await import("@/app/[locale]/mfa/setup/page")
    render(<MfaSetupPage />)

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/login")
    })
  })

  it("redirects users who already enabled MFA", async () => {
    useAuthMock.mockReturnValue({
      user: { roles: ["PROVIDER"], mfaEnabled: true },
      logout: vi.fn(),
      isLoading: false,
    })

    const { default: MfaSetupPage } = await import("@/app/[locale]/mfa/setup/page")
    render(<MfaSetupPage />)

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/provider/sales")
    })
  })

  it("completes the email verification and authenticator setup flow", async () => {
    const logoutMock = vi.fn()
    useAuthMock.mockReturnValue({
      user: { roles: ["CLIENT"], mfaEnabled: false },
      logout: logoutMock,
      isLoading: false,
    })
    generateMfaEmailOtpMock.mockResolvedValue({})
    setupMfaMock.mockResolvedValue({ qrCode: "data:image/png;base64,qr" })
    verifyMfaMock.mockResolvedValue({})

    const originalLocation = window.location
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { href: "" },
    })

    const { default: MfaSetupPage } = await import("@/app/[locale]/mfa/setup/page")
    render(<MfaSetupPage />)

    await waitFor(() => {
      expect(generateMfaEmailOtpMock).toHaveBeenCalled()
    })
    expect(toastSuccessMock).toHaveBeenCalledWith("Código enviado a tu correo")

    fireEvent.change(screen.getByLabelText("Código de Correo"), {
      target: { value: "123456" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }))

    await waitFor(() => {
      expect(setupMfaMock).toHaveBeenCalledWith("123456")
    })
    expect(screen.getByAltText("QR Code")).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("Código de Authenticator"), {
      target: { value: "654321" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Confirmar Seguridad" }))

    await waitFor(() => {
      expect(verifyMfaMock).toHaveBeenCalledWith("654321")
    })
    expect(window.location.href).toBe("/dashboard")

    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    })
  })

  it("shows errors when OTP setup or verification fails", async () => {
    useAuthMock.mockReturnValue({
      user: { roles: ["CLIENT"], mfaEnabled: false },
      logout: vi.fn(),
      isLoading: false,
    })
    generateMfaEmailOtpMock.mockRejectedValue(new Error("smtp"))
    setupMfaMock.mockRejectedValue(new Error("bad otp"))

    const { default: MfaSetupPage } = await import("@/app/[locale]/mfa/setup/page")
    render(<MfaSetupPage />)

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("Error al enviar el código a tu correo")
    })

    fireEvent.change(screen.getByLabelText("Código de Correo"), {
      target: { value: "123456" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }))

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("Código incorrecto o expirado")
    })
  })
})
