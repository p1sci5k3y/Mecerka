import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

const useAuthMock = vi.fn()
const useCartMock = vi.fn()
const useLocaleMock = vi.fn()
const useTranslationsMock = vi.fn()
const usePathnameMock = vi.fn()
const routerReplaceMock = vi.fn()
const logoutMock = vi.fn()

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => useAuthMock(),
}))

vi.mock("@/contexts/cart-context", () => ({
  useCart: () => useCartMock(),
}))

vi.mock("next-intl", () => ({
  useLocale: () => useLocaleMock(),
  useTranslations: () => useTranslationsMock(),
}))

vi.mock("@/lib/navigation", () => ({
  usePathname: () => usePathnameMock(),
  useRouter: () => ({
    replace: routerReplaceMock,
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

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    asChild,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    asChild?: boolean
    variant?: string
    size?: string
  }) => (asChild ? <>{children}</> : <button {...rest}>{children}</button>),
}))

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onClick,
    disabled,
    asChild,
  }: {
    children: React.ReactNode
    onClick?: () => void
    disabled?: boolean
    asChild?: boolean
  }) =>
    asChild ? (
      <div>{children}</div>
    ) : (
      <button onClick={onClick} disabled={disabled} type="button">
        {children}
      </button>
    ),
  DropdownMenuSeparator: () => <hr />,
}))

vi.mock("@/components/brand-mark", () => ({
  BrandMark: () => <span data-testid="brand-mark" />,
  BrandWordmark: () => <span>Mecerka</span>,
}))

describe("Navbar role and locale experience", () => {
  beforeEach(() => {
    routerReplaceMock.mockReset()
    logoutMock.mockReset()
    usePathnameMock.mockReturnValue("/products")
    useCartMock.mockReturnValue({ totalItems: 3 })
  })

  it("shows localized public navigation and language controls for guests", async () => {
    useLocaleMock.mockReturnValue("en")
    useTranslationsMock.mockImplementation(
      () =>
        (key: string) =>
          ({
            catalog: "Catalog",
            login: "Login",
            register: "Sign Up",
            cart: "Cart",
            switchLanguage: "Switch language",
            toggleMenu: "Toggle menu",
          })[key] ?? key,
    )
    useAuthMock.mockReturnValue({
      user: null,
      isAuthenticated: false,
      logout: logoutMock,
    })

    const { Navbar } = await import("@/components/navbar")
    render(<Navbar />)

    expect(screen.getByRole("link", { name: "Catalog" })).toHaveAttribute(
      "href",
      "/products",
    )
    expect(screen.getByRole("link", { name: "Login" })).toHaveAttribute(
      "href",
      "/login",
    )
    expect(screen.getByRole("link", { name: "Sign Up" })).toHaveAttribute(
      "href",
      "/register",
    )
    expect(screen.getByLabelText("Cart")).toHaveAttribute("href", "/cart")
    expect(screen.getByText("3")).toBeInTheDocument()
    expect(screen.getByText("Switch language")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Español" }))
    expect(routerReplaceMock).toHaveBeenCalledWith("/products", { locale: "es" })
  })

  it("shows role-aware authenticated navigation and translated runner entry", async () => {
    useLocaleMock.mockReturnValue("en")
    useTranslationsMock.mockImplementation(
      () =>
        (key: string) =>
          ({
            catalog: "Catalog",
            dashboard: "Dashboard",
            inventory: "Inventory",
            deliveries: "Deliveries",
            profile: "Profile",
            logout: "Logout",
            cart: "Cart",
            switchLanguage: "Switch language",
            toggleMenu: "Toggle menu",
            userFallback: "User",
          })[key] ?? key,
    )
    useAuthMock.mockReturnValue({
      user: {
        userId: "provider-1",
        name: "Alex Rivera",
        roles: ["PROVIDER", "RUNNER"],
        mfaEnabled: true,
        hasPin: true,
      },
      isAuthenticated: true,
      logout: logoutMock,
    })

    const { Navbar } = await import("@/components/navbar")
    render(<Navbar />)

    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "href",
      "/provider/sales",
    )
    expect(screen.getByRole("link", { name: "Inventory" })).toHaveAttribute(
      "href",
      "/provider/products",
    )
    expect(screen.getByRole("link", { name: "Deliveries" })).toHaveAttribute(
      "href",
      "/runner",
    )
    expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute(
      "href",
      "/profile",
    )
    expect(screen.queryByLabelText("Cart")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Logout" })).toBeInTheDocument()
    expect(screen.getByText("Alex Rivera")).toBeInTheDocument()
  })

  it("opens the mobile menu, switches locale and logs out from the authenticated drawer", async () => {
    useLocaleMock.mockReturnValue("es")
    useTranslationsMock.mockImplementation(
      () =>
        (key: string) =>
          ({
            catalog: "Catalogo",
            dashboard: "Panel",
            profile: "Perfil",
            logout: "Salir",
            cart: "Carrito",
            switchLanguage: "Cambiar idioma",
            toggleMenu: "Abrir menu",
            userFallback: "Usuario",
          })[key] ?? key,
    )
    useAuthMock.mockReturnValue({
      user: {
        userId: "client-1",
        name: "Lucia",
        roles: ["CLIENT"],
      },
      isAuthenticated: true,
      logout: logoutMock,
    })
    useCartMock.mockReturnValue({ totalItems: 2 })

    const { Navbar } = await import("@/components/navbar")
    render(<Navbar />)

    fireEvent.click(screen.getByRole("button", { name: "Abrir menu" }))

    expect(screen.getByRole("link", { name: "Carrito" })).toHaveAttribute("href", "/cart")
    fireEvent.click(screen.getByRole("button", { name: "EN" }))
    expect(routerReplaceMock).toHaveBeenCalledWith("/products", { locale: "en" })

    fireEvent.click(screen.getAllByRole("button", { name: "Salir" })[1])
    expect(logoutMock).toHaveBeenCalled()
  })

  it("uses the user fallback label and points runner-only users to the runner dashboard", async () => {
    useLocaleMock.mockReturnValue("en")
    useTranslationsMock.mockImplementation(
      () =>
        (key: string) =>
          ({
            catalog: "Catalog",
            dashboard: "Dashboard",
            deliveries: "Deliveries",
            profile: "Profile",
            logout: "Logout",
            cart: "Cart",
            switchLanguage: "Switch language",
            toggleMenu: "Toggle menu",
            userFallback: "Fallback User",
          })[key] ?? key,
    )
    useAuthMock.mockReturnValue({
      user: {
        userId: "runner-1",
        name: "",
        roles: ["RUNNER"],
      },
      isAuthenticated: true,
      logout: logoutMock,
    })
    useCartMock.mockReturnValue({ totalItems: 0 })

    const { Navbar } = await import("@/components/navbar")
    render(<Navbar />)

    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/runner")
    expect(screen.getByRole("link", { name: "Deliveries" })).toHaveAttribute("href", "/runner")
    expect(screen.getByText("Fallback User")).toBeInTheDocument()
    expect(screen.queryByLabelText("Cart")).not.toBeInTheDocument()
  })

  it("shows guest actions in the mobile drawer and closes it after navigating", async () => {
    useLocaleMock.mockReturnValue("es")
    useTranslationsMock.mockImplementation(
      () =>
        (key: string) =>
          ({
            catalog: "Catalogo",
            login: "Entrar",
            register: "Registrarse",
            cart: "Carrito",
            switchLanguage: "Cambiar idioma",
            toggleMenu: "Abrir menu",
          })[key] ?? key,
    )
    useAuthMock.mockReturnValue({
      user: null,
      isAuthenticated: false,
      logout: logoutMock,
    })
    useCartMock.mockReturnValue({ totalItems: 0 })

    const { Navbar } = await import("@/components/navbar")
    render(<Navbar />)

    fireEvent.click(screen.getByRole("button", { name: "Abrir menu" }))

    const loginLink = screen.getAllByRole("link", { name: "Entrar" })[1]
    expect(loginLink).toHaveAttribute("href", "/login")
    expect(screen.getAllByRole("link", { name: "Registrarse" })[1]).toHaveAttribute(
      "href",
      "/register",
    )
    expect(screen.getAllByRole("link", { name: "Carrito" })[1]).toHaveAttribute("href", "/cart")

    fireEvent.click(screen.getByRole("button", { name: "Abrir menu" }))
    expect(screen.queryAllByRole("link", { name: "Registrarse" })).toHaveLength(1)
  })
})
