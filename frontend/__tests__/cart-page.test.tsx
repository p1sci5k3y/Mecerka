import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

// ── External module mocks ────────────────────────────────────────────────────

vi.mock("next-intl", () => ({
  useLocale: () => "es",
}))

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}))

vi.mock("@/lib/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
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
    checkout: vi.fn(),
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
})
