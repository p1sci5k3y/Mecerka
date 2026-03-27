import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

// ── External module mocks ────────────────────────────────────────────────────

const pushMock = vi.fn()
const checkoutMock = vi.fn()

vi.mock("next-intl", () => ({
  useLocale: () => "es",
}))

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}))

vi.mock("@/lib/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  Link: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
}))

vi.mock("@/components/navbar", () => ({
  Navbar: () => <nav data-testid="navbar" />,
}))

vi.mock("@/components/footer", () => ({
  Footer: () => <footer data-testid="footer" />,
}))

vi.mock("@/lib/services/cart-service", () => ({
  cartService: {
    checkout: checkoutMock,
    getMyCart: vi.fn(),
  },
}))

// ── Context mocks ────────────────────────────────────────────────────────────

const mockUseAuth = vi.fn()
vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => mockUseAuth(),
}))

const mockUseCart = vi.fn()
vi.mock("@/contexts/cart-context", () => ({
  useCart: () => mockUseCart(),
}))

// ── Helpers ──────────────────────────────────────────────────────────────────

function emptyGuestCart() {
  return {
    cart: { providerGroups: [], totalItems: 0, totalPrice: 0, cityName: null, source: "guest" },
    providerGroups: [],
    items: [],
    totalItems: 0,
    totalPrice: 0,
    source: "guest",
    cityConflict: null,
    isLoading: false,
    isSyncing: false,
    removeItem: vi.fn(),
    updateQuantity: vi.fn(),
    refreshCart: vi.fn(),
    addItem: vi.fn(),
    clearCart: vi.fn(),
    syncGuestCartToBackend: vi.fn(),
  }
}

function cartWithItem() {
  const item = {
    id: "item-1",
    productId: "prod-1",
    quantity: 2,
    unitPrice: 19.99,
    baseUnitPrice: 19.99,
    appliedDiscountUnitPrice: null,
    discountAmount: 0,
    subtotal: 39.98,
    originalSubtotal: 39.98,
    source: "guest",
    product: {
      id: "prod-1",
      name: "Camiseta artesanal",
      price: 19.99,
      basePrice: 19.99,
      discountPrice: null,
      city: "Madrid",
      imageUrl: null,
      category: "Ropa",
      description: "Camiseta hecha a mano",
      providerId: "prov-1",
      provider: { name: "Artesanos Madrid" },
    },
  }
  const providerGroup = {
    id: "guest-prov-1",
    providerId: "prov-1",
    providerName: "Artesanos Madrid",
    subtotalAmount: 39.98,
    originalSubtotalAmount: 39.98,
    discountAmount: 0,
    itemCount: 2,
    items: [item],
  }
  return {
    cart: {
      providerGroups: [providerGroup],
      totalItems: 2,
      totalPrice: 39.98,
      originalTotalPrice: 39.98,
      discountAmount: 0,
      cityName: "Madrid",
      source: "guest",
    },
    providerGroups: [providerGroup],
    items: [item],
    totalItems: 2,
    totalPrice: 39.98,
    source: "guest",
    cityConflict: null,
    isLoading: false,
    isSyncing: false,
    removeItem: vi.fn(),
    updateQuantity: vi.fn(),
    refreshCart: vi.fn(),
    addItem: vi.fn(),
    clearCart: vi.fn(),
    syncGuestCartToBackend: vi.fn(),
  }
}

// ── Import component after mocks ─────────────────────────────────────────────
// Dynamic import so vi.mock() hoisting fires first in the test file scope.
beforeEach(async () => {
  vi.resetModules()
  pushMock.mockReset()
  checkoutMock.mockReset()
  // Re-import is handled per describe block below; here we just reset state
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe("CartPage – empty guest cart", () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ user: null, isAuthenticated: false, isLoading: false })
    mockUseCart.mockReturnValue(emptyGuestCart())
  })

  it("shows empty cart message when there are no items", async () => {
    const { default: Page } = await import("@/app/[locale]/cart/page")
    render(<Page />)

    expect(screen.getByText("La cesta está vacía")).toBeInTheDocument()
    expect(screen.getByText("Explorar el mercado")).toBeInTheDocument()
  })

  it("shows guest cart banner for unauthenticated users", async () => {
    const { default: Page } = await import("@/app/[locale]/cart/page")
    render(<Page />)

    expect(screen.getByText("Mini-cesta temporal")).toBeInTheDocument()
  })

  it("surfaces city conflicts and sync banners when the guest cart is constrained", async () => {
    mockUseCart.mockReturnValue({
      ...emptyGuestCart(),
      cityConflict: "Solo puedes comprar productos de la misma ciudad.",
      isSyncing: true,
    })

    const { default: Page } = await import("@/app/[locale]/cart/page")
    render(<Page />)

    expect(
      screen.getByText("Solo puedes comprar productos de la misma ciudad."),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Estamos sincronizando tu mini-cesta con el carrito oficial/i),
    ).toBeInTheDocument()
  })
})

describe("CartPage – cart with items (guest)", () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ user: null, isAuthenticated: false, isLoading: false })
    mockUseCart.mockReturnValue(cartWithItem())
  })

  it("renders product name and subtotal for each item", async () => {
    const { default: Page } = await import("@/app/[locale]/cart/page")
    render(<Page />)

    expect(screen.getByText("Camiseta artesanal")).toBeInTheDocument()
    // Summary section shows provider subtotal
    expect(screen.getAllByText(/39,98\s*€/).length).toBeGreaterThan(0)
  })

  it("shows login prompt instead of checkout form for guest cart", async () => {
    const { default: Page } = await import("@/app/[locale]/cart/page")
    render(<Page />)

    expect(screen.getByText("Iniciar sesión y continuar")).toBeInTheDocument()
    expect(screen.getByText("Crear cuenta cliente")).toBeInTheDocument()
  })

  it("redirects guests to login preserving the cart return path", async () => {
    const { default: Page } = await import("@/app/[locale]/cart/page")
    render(<Page />)

    fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión y continuar" }))

    expect(pushMock).toHaveBeenCalledWith("/login?returnTo=%2Fcart")
  })

  it("redirects guests to register preserving the cart return path", async () => {
    const { default: Page } = await import("@/app/[locale]/cart/page")
    render(<Page />)

    fireEvent.click(screen.getByRole("button", { name: "Crear cuenta cliente" }))

    expect(pushMock).toHaveBeenCalledWith("/register?returnTo=%2Fcart")
  })
})

describe("CartPage – authenticated user with server cart", () => {
  beforeEach(() => {
    const serverCartState = {
      ...cartWithItem(),
      source: "server",
      cart: {
        ...cartWithItem().cart,
        source: "server",
        cityId: "city-1",
      },
    }
    mockUseAuth.mockReturnValue({
      user: { id: "u1", roles: ["CLIENT"], email: "test@test.com" },
      isAuthenticated: true,
      isLoading: false,
    })
    mockUseCart.mockReturnValue(serverCartState)
  })

  it("renders the delivery address form fields", async () => {
    const { default: Page } = await import("@/app/[locale]/cart/page")
    render(<Page />)

    expect(screen.getByLabelText("Dirección de entrega")).toBeInTheDocument()
    expect(screen.getByLabelText("Código postal")).toBeInTheDocument()
  })

  it("shows validation toast when submitting without required fields", async () => {
    const { toast } = await import("sonner")
    const { default: Page } = await import("@/app/[locale]/cart/page")
    render(<Page />)

    const checkoutBtn = screen.getByRole("button", { name: /Crear pedido oficial/i })
    fireEvent.click(checkoutBtn)

    expect(toast.error).toHaveBeenCalledWith("La dirección de entrega es obligatoria.")
  })

  it("requires postal code and a city id before checkout", async () => {
    const { toast } = await import("sonner")
    mockUseCart.mockReturnValue({
      ...cartWithItem(),
      source: "server",
      cart: {
        ...cartWithItem().cart,
        source: "server",
        cityId: undefined,
      },
    })

    const { default: Page } = await import("@/app/[locale]/cart/page")
    const { rerender } = render(<Page />)

    fireEvent.change(screen.getByLabelText("Dirección de entrega"), {
      target: { value: "Calle Feria 12" },
    })
    fireEvent.click(screen.getByRole("button", { name: /Crear pedido oficial/i }))

    expect(toast.error).toHaveBeenCalledWith(
      "El carrito oficial todavía no tiene ciudad operativa.",
    )

    mockUseCart.mockReturnValue({
      ...cartWithItem(),
      source: "server",
      cart: {
        ...cartWithItem().cart,
        source: "server",
        cityId: "city-1",
      },
    })

    rerender(<Page />)
    fireEvent.change(screen.getByLabelText("Dirección de entrega"), {
      target: { value: "Calle Feria 12" },
    })
    fireEvent.click(screen.getByRole("button", { name: /Crear pedido oficial/i }))

    expect(toast.error).toHaveBeenCalledWith("El código postal es obligatorio.")
  })

  it("blocks checkout for authenticated users without CLIENT role", async () => {
    const { toast } = await import("sonner")
    mockUseAuth.mockReturnValue({
      user: { id: "u2", roles: ["PROVIDER"], email: "maker@test.com" },
      isAuthenticated: true,
      isLoading: false,
    })

    const { default: Page } = await import("@/app/[locale]/cart/page")
    render(<Page />)

    fireEvent.change(screen.getByLabelText("Dirección de entrega"), {
      target: { value: "Calle Feria 12" },
    })
    fireEvent.change(screen.getByLabelText("Código postal"), {
      target: { value: "41003" },
    })
    fireEvent.click(screen.getByRole("button", { name: /Crear pedido oficial/i }))

    expect(toast.error).toHaveBeenCalledWith(
      "El checkout oficial está disponible para cuentas cliente.",
    )
  })

  it("requires a valid positive discovery radius before checkout", async () => {
    const { toast } = await import("sonner")
    const { default: Page } = await import("@/app/[locale]/cart/page")
    render(<Page />)

    fireEvent.change(screen.getByLabelText("Dirección de entrega"), {
      target: { value: "Calle Feria 12" },
    })
    fireEvent.change(screen.getByLabelText("Código postal"), {
      target: { value: "41003" },
    })
    fireEvent.change(screen.getByLabelText("Radio de compra"), {
      target: { value: "0" },
    })
    fireEvent.click(screen.getByRole("button", { name: /Crear pedido oficial/i }))

    expect(toast.error).toHaveBeenCalledWith(
      "Indica un radio de compra válido en kilómetros.",
    )
  })

  it("creates the official order, refreshes the cart and redirects to split payments", async () => {
    const refreshCartMock = vi.fn().mockResolvedValue(undefined)
    mockUseCart.mockReturnValue({
      ...mockUseCart.mock.results.at(-1)?.value,
      ...{
        ...cartWithItem(),
        source: "server",
        cart: {
          ...cartWithItem().cart,
          source: "server",
          cityId: "city-1",
        },
        refreshCart: refreshCartMock,
      },
    })

    const assignMock = vi.fn()
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { assign: assignMock },
    })
    checkoutMock.mockResolvedValueOnce({ id: "order-99" })

    const { toast } = await import("sonner")
    const { default: Page } = await import("@/app/[locale]/cart/page")
    render(<Page />)

    fireEvent.change(screen.getByLabelText("Dirección de entrega"), {
      target: { value: "Calle Feria 12" },
    })
    fireEvent.change(screen.getByLabelText("Código postal"), {
      target: { value: "41003" },
    })
    fireEvent.change(screen.getByLabelText("Referencia adicional"), {
      target: { value: "Puerta 2B" },
    })
    fireEvent.change(screen.getByLabelText("Radio de compra"), {
      target: { value: "7" },
    })
    fireEvent.click(screen.getByRole("button", { name: /Crear pedido oficial/i }))

    await Promise.resolve()
    await Promise.resolve()

    expect(checkoutMock).toHaveBeenCalledWith(
      {
        cityId: "city-1",
        deliveryAddress: "Calle Feria 12",
        postalCode: "41003",
        addressReference: "Puerta 2B",
        discoveryRadiusKm: 7,
      },
      expect.any(String),
    )
    expect(refreshCartMock).toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledWith(
      "Pedido oficial creado. Ahora debes revisar los pagos separados por comercio.",
    )
    expect(assignMock).toHaveBeenCalledWith("/es/orders/order-99/payments")
  })
})
