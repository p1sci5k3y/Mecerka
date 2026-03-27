import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

const pushMock = vi.fn()
const backMock = vi.fn()
const searchParamsGetMock = vi.fn()
const useTranslationsMock = vi.fn()
const apiGetMock = vi.fn()
const apiPostMock = vi.fn()
const toastSuccessMock = vi.fn()
const toastErrorMock = vi.fn()

vi.mock("@/lib/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    back: backMock,
  }),
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

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: searchParamsGetMock,
  }),
}))

vi.mock("next-intl", () => ({
  useTranslations: () => useTranslationsMock(),
}))

vi.mock("@/lib/api", () => ({
  api: {
    get: (...args: unknown[]) => apiGetMock(...args),
    post: (...args: unknown[]) => apiPostMock(...args),
  },
}))

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}))

vi.mock("@/components/brand-mark", () => ({
  BrandMark: () => <span data-testid="brand-mark" />,
  BrandWordmark: () => <span>Mecerka</span>,
}))

describe("Password recovery pages", () => {
  beforeEach(() => {
    pushMock.mockReset()
    backMock.mockReset()
    searchParamsGetMock.mockReset()
    useTranslationsMock.mockReset()
    apiGetMock.mockReset()
    apiPostMock.mockReset()
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()

    useTranslationsMock.mockImplementation(
      () =>
        (key: string, values?: Record<string, string | number>) =>
          values ? `${key}:${JSON.stringify(values)}` : key,
    )
  })

  it("submits forgot-password and switches to success state", async () => {
    apiPostMock.mockResolvedValue({})

    const { default: ForgotPasswordPage } = await import(
      "@/app/[locale]/forgot-password/page"
    )
    render(<ForgotPasswordPage />)

    fireEvent.change(screen.getByLabelText("emailLabel"), {
      target: { value: "user.demo@local.test" },
    })
    fireEvent.click(screen.getByRole("button", { name: "forgotButton" }))

    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledWith("/auth/forgot-password", {
        email: "user.demo@local.test",
      })
    })

    expect(toastSuccessMock).toHaveBeenCalledWith("forgotSuccessTitle")
    expect(screen.getByText("forgotSuccessSubtitle")).toBeInTheDocument()
  })

  it("surfaces forgot-password errors", async () => {
    apiPostMock.mockRejectedValue(new Error("No existe esa cuenta"))

    const { default: ForgotPasswordPage } = await import(
      "@/app/[locale]/forgot-password/page"
    )
    render(<ForgotPasswordPage />)

    fireEvent.change(screen.getByLabelText("emailLabel"), {
      target: { value: "user.demo@local.test" },
    })
    fireEvent.click(screen.getByRole("button", { name: "forgotButton" }))

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("No existe esa cuenta")
    })
  })

  it("redirects to login when the reset token is missing", async () => {
    searchParamsGetMock.mockImplementation(() => null)

    const { default: ResetPasswordPage } = await import(
      "@/app/[locale]/reset-password/page"
    )
    render(<ResetPasswordPage />)

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("invalidResetLink")
    })
    expect(pushMock).toHaveBeenCalledWith("/login")
  })

  it("redirects to login when the reset token is invalid", async () => {
    searchParamsGetMock.mockImplementation((key: string) =>
      key === "token" ? "bad-token" : null,
    )
    apiGetMock.mockRejectedValue(new Error("Token expirado"))

    const { default: ResetPasswordPage } = await import(
      "@/app/[locale]/reset-password/page"
    )
    render(<ResetPasswordPage />)

    await waitFor(() => {
      expect(apiGetMock).toHaveBeenCalledWith(
        "/auth/verify-reset-token?token=bad-token",
      )
    })
    expect(toastErrorMock).toHaveBeenCalledWith("Token expirado")
    expect(pushMock).toHaveBeenCalledWith("/login")
  })

  it("verifies the token and resets the password successfully", async () => {
    searchParamsGetMock.mockImplementation((key: string) =>
      key === "token" ? "valid-token" : null,
    )
    apiGetMock.mockResolvedValue({})
    apiPostMock.mockResolvedValue({})

    const { default: ResetPasswordPage } = await import(
      "@/app/[locale]/reset-password/page"
    )
    render(<ResetPasswordPage />)

    await waitFor(() => {
      expect(screen.getByText("resetTitle")).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText("resetPasswordLabel"), {
      target: { value: "DemoPass123!" },
    })
    fireEvent.click(screen.getByRole("button", { name: "resetButton" }))

    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledWith("/auth/reset-password", {
        token: "valid-token",
        newPassword: "DemoPass123!",
      })
    })

    expect(toastSuccessMock).toHaveBeenCalledWith("resetSuccess")
    expect(screen.getByText("resetSuccessTitle")).toBeInTheDocument()
  })

  it("shows reset-password API errors", async () => {
    searchParamsGetMock.mockImplementation((key: string) =>
      key === "token" ? "valid-token" : null,
    )
    apiGetMock.mockResolvedValue({})
    apiPostMock.mockRejectedValue(new Error("Token inválido"))

    const { default: ResetPasswordPage } = await import(
      "@/app/[locale]/reset-password/page"
    )
    render(<ResetPasswordPage />)

    await waitFor(() => {
      expect(screen.getByText("resetTitle")).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText("resetPasswordLabel"), {
      target: { value: "DemoPass123!" },
    })
    fireEvent.click(screen.getByRole("button", { name: "resetButton" }))

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("Token inválido")
    })
  })
})
