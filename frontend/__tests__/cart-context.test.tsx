import { beforeEach, describe, expect, it, vi, afterEach } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { CartView, Product } from "@/lib/types"
import { CartProvider, useCart } from "@/contexts/cart-context"

const useAuthMock = vi.fn()
const getMyCartMock = vi.fn()
const addItemMock = vi.fn()
const removeItemMock = vi.fn()
const updateItemMock = vi.fn()
const toastErrorMock = vi.fn()

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => useAuthMock(),
}))

vi.mock("@/lib/services/cart-service", () => ({
  cartService: {
    getMyCart: (...args: unknown[]) => getMyCartMock(...args),
    addItem: (...args: unknown[]) => addItemMock(...args),
    removeItem: (...args: unknown[]) => removeItemMock(...args),
    updateItem: (...args: unknown[]) => updateItemMock(...args),
  },
}))

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}))

function buildServerCart(overrides: Partial<CartView> = {}): CartView {
  return {
    id: "cart-1",
    cityId: "city-1",
    cityName: "Madrid",
    providerGroups: [],
    totalItems: 0,
    totalPrice: 0,
    originalTotalPrice: 0,
    discountAmount: 0,
    source: "server",
    ...overrides,
  }
}

const madridProduct: Product = {
  id: "prod-1",
  name: "Cuenco",
  description: "desc",
  price: 12,
  basePrice: 12,
  discountPrice: null,
  stock: 5,
  city: "Madrid",
  category: "Cerámica",
  providerId: "provider-1",
  provider: { name: "Cerámica Norte" },
  createdAt: "2026-03-24T10:00:00.000Z",
}

const sevillaProduct: Product = {
  ...madridProduct,
  id: "prod-2",
  name: "Bolso",
  city: "Sevilla",
  providerId: "provider-2",
  provider: { name: "Cuero Sur" },
}

function CartProbe() {
  const ctx = useCart()

  return (
    <div>
      <p>source:{ctx.source}</p>
      <p>items:{ctx.totalItems}</p>
      <p>city:{ctx.cart.cityName ?? "none"}</p>
      <p>conflict:{ctx.cityConflict ?? "none"}</p>
      <button type="button" onClick={() => void ctx.addItem(madridProduct, 1)}>
        add-madrid
      </button>
      <button type="button" onClick={() => void ctx.addItem(sevillaProduct, 1)}>
        add-sevilla
      </button>
      <button type="button" onClick={() => void ctx.updateQuantity("prod-1", 3)}>
        update
      </button>
      <button type="button" onClick={() => void ctx.removeItem("prod-1")}>
        remove
      </button>
    </div>
  )
}

describe("CartProvider", () => {
  beforeEach(() => {
    window.localStorage.clear()
    useAuthMock.mockReset()
    getMyCartMock.mockReset()
    addItemMock.mockReset()
    removeItemMock.mockReset()
    updateItemMock.mockReset()
    toastErrorMock.mockReset()
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  it("builds and persists a guest cart for products from the same city", async () => {
    useAuthMock.mockReturnValue({ isAuthenticated: false })

    render(
      <CartProvider>
        <CartProbe />
      </CartProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText("source:guest")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: "add-madrid" }))

    await waitFor(() => {
      expect(screen.getByText("items:1")).toBeInTheDocument()
    })

    expect(screen.getByText("city:Madrid")).toBeInTheDocument()
    expect(window.localStorage.getItem("mecerka-guest-cart-v1")).toContain("prod-1")
  })

  it("blocks cross-city guest additions with a conflict message", async () => {
    useAuthMock.mockReturnValue({ isAuthenticated: false })

    render(
      <CartProvider>
        <CartProbe />
      </CartProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText("source:guest")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: "add-madrid" }))
    fireEvent.click(screen.getByRole("button", { name: "add-sevilla" }))

    await waitFor(() => {
      expect(
        screen.getByText(/conflict:Solo puedes comprar productos de la misma ciudad/i),
      ).toBeInTheDocument()
    })
  })

  it("refreshes the official backend cart for authenticated users on mount", async () => {
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      user: { roles: ["CLIENT"] },
    })
    getMyCartMock.mockResolvedValueOnce(
      buildServerCart({
        cityName: "Sevilla",
        totalItems: 2,
        totalPrice: 39.98,
      }),
    )

    render(
      <CartProvider>
        <CartProbe />
      </CartProvider>,
    )

    await waitFor(() => {
      expect(getMyCartMock).toHaveBeenCalled()
    })
  })

  it("syncs a guest cart into the backend on authenticated mount", async () => {
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      user: { roles: ["CLIENT"] },
    })
    window.localStorage.setItem(
      "mecerka-guest-cart-v1",
      JSON.stringify([{ product: madridProduct, quantity: 1 }]),
    )
    addItemMock.mockResolvedValue(buildServerCart())
    getMyCartMock.mockResolvedValue(buildServerCart())

    render(
      <CartProvider>
        <CartProbe />
      </CartProvider>,
    )

    await waitFor(() => {
      expect(addItemMock).toHaveBeenCalledWith("prod-1", 1)
    })
    await waitFor(() => {
      expect(getMyCartMock).toHaveBeenCalled()
    })

    await waitFor(() => {
      expect(window.localStorage.getItem("mecerka-guest-cart-v1")).toBeNull()
    })
  })

  it("does not request the backend cart for authenticated users without client role", async () => {
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      user: { roles: ["PROVIDER"] },
    })

    render(
      <CartProvider>
        <CartProbe />
      </CartProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText("source:guest")).toBeInTheDocument()
    })

    expect(getMyCartMock).not.toHaveBeenCalled()
  })
})
