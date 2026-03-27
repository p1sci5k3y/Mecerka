import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

const useAuthMock = vi.fn()
const pushMock = vi.fn()
const backMock = vi.fn()
const searchParamsGetMock = vi.fn()
const useTranslationsMock = vi.fn()
const toastSuccessMock = vi.fn()
const toastErrorMock = vi.fn()

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => useAuthMock(),
}))

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

describe("RegisterPage", () => {
  function acceptTerms() {
    const checkbox = document.getElementById("terms") as HTMLInputElement | null
    expect(checkbox).not.toBeNull()
    fireEvent.click(checkbox!)
  }

  beforeEach(() => {
    useAuthMock.mockReset()
    pushMock.mockReset()
    backMock.mockReset()
    searchParamsGetMock.mockReset()
    useTranslationsMock.mockReset()
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()

    useTranslationsMock.mockImplementation(() => (key: string) => key)
    searchParamsGetMock.mockReturnValue(null)
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
  })

  it("blocks registration when the captcha answer is wrong", async () => {
    const registerMock = vi.fn()
    useAuthMock.mockReturnValue({ register: registerMock })

    const { default: RegisterPage } = await import("@/app/[locale]/register/page")
    render(<RegisterPage />)

    fireEvent.change(screen.getByPlaceholderText("Sofia Alva"), {
      target: { value: "User Demo" },
    })
    fireEvent.change(screen.getByPlaceholderText("hello@example.com"), {
      target: { value: "user.demo@local.test" },
    })
    fireEvent.change(screen.getByPlaceholderText("••••••••••••"), {
      target: { value: "DemoPass123!" },
    })
    fireEvent.change(screen.getByPlaceholderText("Resultado"), {
      target: { value: "99" },
    })
    acceptTerms()
    fireEvent.click(screen.getByRole("button", { name: "registerButton" }))

    expect(toastErrorMock).toHaveBeenCalledWith(
      "Validación de seguridad (CAPTCHA) incorrecta. Inténtalo de nuevo.",
    )
    expect(registerMock).not.toHaveBeenCalled()
  })

  it("requires strong passwords before submitting", async () => {
    const registerMock = vi.fn()
    useAuthMock.mockReturnValue({ register: registerMock })

    const { default: RegisterPage } = await import("@/app/[locale]/register/page")
    render(<RegisterPage />)

    fireEvent.change(screen.getByPlaceholderText("Sofia Alva"), {
      target: { value: "User Demo" },
    })
    fireEvent.change(screen.getByPlaceholderText("hello@example.com"), {
      target: { value: "user.demo@local.test" },
    })
    fireEvent.change(screen.getByPlaceholderText("••••••••••••"), {
      target: { value: "short" },
    })
    fireEvent.change(screen.getByPlaceholderText("Resultado"), {
      target: { value: "2" },
    })
    acceptTerms()
    fireEvent.click(screen.getByRole("button", { name: "registerButton" }))

    expect(toastErrorMock).toHaveBeenCalledWith(
      "Debes utilizar una contraseña fuerte de al menos 12 caracteres (Normativa ASVS 5.0).",
    )
    expect(registerMock).not.toHaveBeenCalled()
  })

  it("creates the account and shows the success state with the preserved return path", async () => {
    searchParamsGetMock.mockImplementation((key: string) =>
      key === "returnTo" ? "/orders" : null,
    )
    const registerMock = vi.fn().mockResolvedValue({})
    useAuthMock.mockReturnValue({ register: registerMock })

    const { default: RegisterPage } = await import("@/app/[locale]/register/page")
    render(<RegisterPage />)

    fireEvent.change(screen.getByPlaceholderText("Sofia Alva"), {
      target: { value: "User Demo" },
    })
    fireEvent.change(screen.getByPlaceholderText("hello@example.com"), {
      target: { value: "user.demo@local.test" },
    })
    fireEvent.change(screen.getByPlaceholderText("••••••••••••"), {
      target: { value: "DemoPass123!" },
    })
    fireEvent.change(screen.getByPlaceholderText("Resultado"), {
      target: { value: "2" },
    })
    acceptTerms()
    fireEvent.click(screen.getByRole("button", { name: "registerButton" }))

    await waitFor(() => {
      expect(registerMock).toHaveBeenCalledWith({
        name: "User Demo",
        email: "user.demo@local.test",
        password: "DemoPass123!",
      })
    })

    expect(toastSuccessMock).toHaveBeenCalled()
    expect(screen.getByText("successTitle")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "goToLogin" })).toHaveAttribute(
      "href",
      "/login?returnTo=%2Forders",
    )
  })

  it("surfaces backend registration errors", async () => {
    const registerMock = vi.fn().mockRejectedValue({ message: "Email ya registrado" })
    useAuthMock.mockReturnValue({ register: registerMock })

    const { default: RegisterPage } = await import("@/app/[locale]/register/page")
    render(<RegisterPage />)

    fireEvent.change(screen.getByPlaceholderText("Sofia Alva"), {
      target: { value: "User Demo" },
    })
    fireEvent.change(screen.getByPlaceholderText("hello@example.com"), {
      target: { value: "user.demo@local.test" },
    })
    fireEvent.change(screen.getByPlaceholderText("••••••••••••"), {
      target: { value: "DemoPass123!" },
    })
    fireEvent.change(screen.getByPlaceholderText("Resultado"), {
      target: { value: "2" },
    })
    acceptTerms()
    fireEvent.click(screen.getByRole("button", { name: "registerButton" }))

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("Email ya registrado")
    })
  })
})
