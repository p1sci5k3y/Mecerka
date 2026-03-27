import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

const useAuthMock = vi.fn()
const replaceMock = vi.fn()
const backMock = vi.fn()
const searchParamsGetMock = vi.fn()
const useTranslationsMock = vi.fn()
const apiPostMock = vi.fn()
const setAuthSessionHintMock = vi.fn()
const toastSuccessMock = vi.fn()
const toastErrorMock = vi.fn()

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => useAuthMock(),
}))

vi.mock("@/lib/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock,
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
    post: (...args: unknown[]) => apiPostMock(...args),
  },
}))

vi.mock("@/lib/auth-session", () => ({
  setAuthSessionHint: () => setAuthSessionHintMock(),
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

describe("LoginPage", () => {
  beforeEach(() => {
    useAuthMock.mockReset()
    replaceMock.mockReset()
    backMock.mockReset()
    searchParamsGetMock.mockReset()
    useTranslationsMock.mockReset()
    apiPostMock.mockReset()
    setAuthSessionHintMock.mockReset()
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()

    useTranslationsMock.mockImplementation(() => (key: string) => key)
    searchParamsGetMock.mockReturnValue(null)
  })

  it("logs in without MFA and redirects to a safe return path", async () => {
    searchParamsGetMock.mockImplementation((key: string) =>
      key === "returnTo" ? "/orders" : null,
    )
    const loginMock = vi.fn().mockResolvedValue({
      user: { roles: ["CLIENT"], mfaEnabled: false },
    })
    useAuthMock.mockReturnValue({ login: loginMock })

    const { default: LoginPage } = await import("@/app/[locale]/login/page")
    render(<LoginPage />)

    fireEvent.change(screen.getByLabelText("emailLabel"), {
      target: { value: "user.demo@local.test" },
    })
    fireEvent.change(screen.getByLabelText("passwordLabel"), {
      target: { value: "DemoPass123!" },
    })
    fireEvent.click(screen.getByRole("button", { name: "loginButton" }))

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith({
        email: "user.demo@local.test",
        password: "DemoPass123!",
      })
    })

    expect(toastSuccessMock).toHaveBeenCalled()
    expect(replaceMock).toHaveBeenCalledWith("/orders")
  })

  it("ignores unsafe returnTo values and falls back to the role route", async () => {
    searchParamsGetMock.mockImplementation((key: string) =>
      key === "returnTo" ? "https://evil.example" : null,
    )
    const loginMock = vi.fn().mockResolvedValue({
      user: { roles: ["PROVIDER"], mfaEnabled: false },
    })
    useAuthMock.mockReturnValue({ login: loginMock })

    const { default: LoginPage } = await import("@/app/[locale]/login/page")
    render(<LoginPage />)

    fireEvent.change(screen.getByLabelText("emailLabel"), {
      target: { value: "provider.demo@local.test" },
    })
    fireEvent.change(screen.getByLabelText("passwordLabel"), {
      target: { value: "DemoPass123!" },
    })
    fireEvent.click(screen.getByRole("button", { name: "loginButton" }))

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/provider/sales")
    })
  })

  it("switches to MFA step when the user requires MFA and completes verification", async () => {
    const loginMock = vi.fn().mockResolvedValue({
      user: { roles: ["RUNNER"], mfaEnabled: true },
    })
    useAuthMock.mockReturnValue({ login: loginMock })
    apiPostMock.mockResolvedValue({})

    const { default: LoginPage } = await import("@/app/[locale]/login/page")
    render(<LoginPage />)

    fireEvent.change(screen.getByLabelText("emailLabel"), {
      target: { value: "runner.demo@local.test" },
    })
    fireEvent.change(screen.getByLabelText("passwordLabel"), {
      target: { value: "DemoPass123!" },
    })
    fireEvent.click(screen.getByRole("button", { name: "loginButton" }))

    await waitFor(() => {
      expect(screen.getByText("mfaTitle")).toBeInTheDocument()
    })

    const otpInputs = screen.getAllByRole("textbox")
    for (const [index, value] of ["1", "2", "3", "4", "5", "6"].entries()) {
      fireEvent.change(otpInputs[index], { target: { value } })
    }

    fireEvent.click(screen.getByRole("button", { name: "mfaButton" }))

    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledWith("/auth/mfa/verify", { token: "123456" })
    })

    expect(setAuthSessionHintMock).toHaveBeenCalled()
    expect(replaceMock).toHaveBeenCalledWith("/runner")
  })

  it("keeps MFA submission disabled until the six digits are complete", async () => {
    const loginMock = vi.fn().mockResolvedValue({
      user: { roles: ["CLIENT"], mfaEnabled: true },
    })
    useAuthMock.mockReturnValue({ login: loginMock })

    const { default: LoginPage } = await import("@/app/[locale]/login/page")
    render(<LoginPage />)

    fireEvent.change(screen.getByLabelText("emailLabel"), {
      target: { value: "user.demo@local.test" },
    })
    fireEvent.change(screen.getByLabelText("passwordLabel"), {
      target: { value: "DemoPass123!" },
    })
    fireEvent.click(screen.getByRole("button", { name: "loginButton" }))

    await waitFor(() => {
      expect(screen.getByText("mfaTitle")).toBeInTheDocument()
    })

    expect(screen.getByRole("button", { name: "mfaButton" })).toBeDisabled()
    expect(apiPostMock).not.toHaveBeenCalled()
  })

  it("shows the login error when credentials are invalid", async () => {
    const loginMock = vi.fn().mockRejectedValue(new Error("Credenciales inválidas."))
    useAuthMock.mockReturnValue({ login: loginMock })

    const { default: LoginPage } = await import("@/app/[locale]/login/page")
    render(<LoginPage />)

    fireEvent.change(screen.getByLabelText("emailLabel"), {
      target: { value: "user.demo@local.test" },
    })
    fireEvent.change(screen.getByLabelText("passwordLabel"), {
      target: { value: "wrong" },
    })
    fireEvent.click(screen.getByRole("button", { name: "loginButton" }))

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("Credenciales inválidas.")
    })
  })

  it("surfaces plain-object login errors and falls back safely when no message exists", async () => {
    const loginMock = vi
      .fn()
      .mockRejectedValueOnce({ message: "Cuenta bloqueada temporalmente." })
      .mockRejectedValueOnce({})
    useAuthMock.mockReturnValue({ login: loginMock })

    const { default: LoginPage } = await import("@/app/[locale]/login/page")
    render(<LoginPage />)

    fireEvent.change(screen.getByLabelText("emailLabel"), {
      target: { value: "user.demo@local.test" },
    })
    fireEvent.change(screen.getByLabelText("passwordLabel"), {
      target: { value: "wrong" },
    })
    fireEvent.click(screen.getByRole("button", { name: "loginButton" }))

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("Cuenta bloqueada temporalmente.")
    })

    fireEvent.click(screen.getByRole("button", { name: "loginButton" }))

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("Credenciales inválidas.")
    })
  })

  it("lets the user go back, toggle password visibility and preserves safe returnTo on register", async () => {
    searchParamsGetMock.mockImplementation((key: string) =>
      key === "returnTo" ? "/orders/order-1/payments" : null,
    )
    useAuthMock.mockReturnValue({ login: vi.fn() })

    const { default: LoginPage } = await import("@/app/[locale]/login/page")
    render(<LoginPage />)

    const passwordInput = screen.getByLabelText("passwordLabel")
    expect(passwordInput).toHaveAttribute("type", "password")

    fireEvent.click(screen.getAllByRole("button")[1])
    expect(passwordInput).toHaveAttribute("type", "text")

    fireEvent.click(screen.getAllByRole("button")[0])
    expect(backMock).toHaveBeenCalled()

    expect(screen.getByRole("link", { name: "createAccount" })).toHaveAttribute(
      "href",
      "/register?returnTo=%2Forders%2Forder-1%2Fpayments",
    )
  })

  it("supports MFA navigation, backspace focus and invalid verification feedback", async () => {
    const loginMock = vi.fn().mockResolvedValue({
      user: { roles: ["CLIENT"], mfaEnabled: true },
    })
    useAuthMock.mockReturnValue({ login: loginMock })
    apiPostMock.mockRejectedValue(new Error("bad token"))

    const { default: LoginPage } = await import("@/app/[locale]/login/page")
    render(<LoginPage />)

    fireEvent.change(screen.getByLabelText("emailLabel"), {
      target: { value: "user.demo@local.test" },
    })
    fireEvent.change(screen.getByLabelText("passwordLabel"), {
      target: { value: "DemoPass123!" },
    })
    fireEvent.click(screen.getByRole("button", { name: "loginButton" }))

    await waitFor(() => {
      expect(screen.getByText("mfaTitle")).toBeInTheDocument()
    })

    const otpInputs = screen.getAllByRole("textbox")
    fireEvent.change(otpInputs[0], { target: { value: "12" } })
    expect(otpInputs[0]).toHaveValue("")

    fireEvent.change(otpInputs[0], { target: { value: "1" } })
    fireEvent.change(otpInputs[1], { target: { value: "2" } })
    otpInputs[1].focus()
    fireEvent.keyDown(otpInputs[2], { key: "Backspace" })
    expect(document.activeElement).toBe(otpInputs[1])
    fireEvent.change(otpInputs[1], { target: { value: "2" } })
    fireEvent.change(otpInputs[2], { target: { value: "3" } })
    fireEvent.change(otpInputs[3], { target: { value: "4" } })
    fireEvent.change(otpInputs[4], { target: { value: "5" } })
    fireEvent.change(otpInputs[5], { target: { value: "6" } })

    fireEvent.click(screen.getByRole("button", { name: "mfaButton" }))

    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledWith("/auth/mfa/verify", { token: "123456" })
      expect(toastErrorMock).toHaveBeenCalledWith("Código incorrecto.")
    })

    fireEvent.click(screen.getByRole("button", { name: "mfaBack" }))
    expect(screen.getByRole("button", { name: "loginButton" })).toBeInTheDocument()
  })
})
