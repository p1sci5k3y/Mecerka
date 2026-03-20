"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { toast } from "sonner"
import { useAuth } from "@/contexts/auth-context"
import { cartService } from "@/lib/services/cart-service"
import type {
  CartItem,
  CartLineItem,
  CartProviderGroup,
  CartView,
  Product,
} from "@/lib/types"

const GUEST_CART_STORAGE_KEY = "mecerka-guest-cart-v1"

interface CartContextType {
  cart: CartView
  providerGroups: CartProviderGroup[]
  items: CartLineItem[]
  totalItems: number
  totalPrice: number
  cityConflict: string | null
  source: "guest" | "server"
  isLoading: boolean
  isSyncing: boolean
  addItem: (product: Product, quantity?: number) => Promise<string | null>
  removeItem: (itemId: string) => Promise<void>
  updateQuantity: (itemId: string, quantity: number) => Promise<void>
  clearCart: () => Promise<void>
  refreshCart: () => Promise<void>
  syncGuestCartToBackend: () => Promise<void>
}

const CartContext = createContext<CartContextType | undefined>(undefined)

function buildGuestCartView(items: CartItem[]): CartView {
  const providerMap = new Map<string, CartProviderGroup>()
  const cityName = items[0]?.product.city ?? null

  for (const item of items) {
    const providerId = item.product.providerId
    const existing = providerMap.get(providerId)
    const baseUnitPrice = item.product.basePrice ?? item.product.price
    const appliedDiscountUnitPrice =
      item.product.discountPrice != null &&
      item.product.discountPrice < baseUnitPrice
        ? item.product.discountPrice
        : null
    const lineItem: CartLineItem = {
      id: item.product.id,
      productId: item.product.id,
      quantity: item.quantity,
      unitPrice: item.product.price,
      baseUnitPrice,
      appliedDiscountUnitPrice,
      discountAmount: Math.max(baseUnitPrice - item.product.price, 0),
      subtotal: item.product.price * item.quantity,
      originalSubtotal: baseUnitPrice * item.quantity,
      product: item.product,
      source: "guest",
    }

    if (existing) {
      existing.items.push(lineItem)
      existing.itemCount += item.quantity
      existing.subtotalAmount += lineItem.subtotal
      existing.originalSubtotalAmount += lineItem.originalSubtotal
      existing.discountAmount += lineItem.discountAmount * item.quantity
      continue
    }

    providerMap.set(providerId, {
      id: `guest-${providerId}`,
      providerId,
      providerName:
        item.product.provider?.name || `Proveedor ${providerId.slice(0, 6)}`,
      subtotalAmount: lineItem.subtotal,
      originalSubtotalAmount: lineItem.originalSubtotal,
      discountAmount: lineItem.discountAmount * item.quantity,
      itemCount: item.quantity,
      items: [lineItem],
    })
  }

  const providerGroups = Array.from(providerMap.values())

  return {
    cityName,
    providerGroups,
    totalItems: providerGroups.reduce(
      (sum, provider) => sum + provider.itemCount,
      0,
    ),
    totalPrice: providerGroups.reduce(
      (sum, provider) => sum + provider.subtotalAmount,
      0,
    ),
    originalTotalPrice: providerGroups.reduce(
      (sum, provider) => sum + provider.originalSubtotalAmount,
      0,
    ),
    discountAmount: providerGroups.reduce(
      (sum, provider) => sum + provider.discountAmount,
      0,
    ),
    source: "guest",
  }
}

function loadGuestCart() {
  if (typeof window === "undefined") return []

  try {
    const raw = window.localStorage.getItem(GUEST_CART_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as CartItem[]
  } catch {
    return []
  }
}

function persistGuestCart(items: CartItem[]) {
  if (typeof window === "undefined") return

  if (items.length === 0) {
    window.localStorage.removeItem(GUEST_CART_STORAGE_KEY)
    return
  }

  window.localStorage.setItem(GUEST_CART_STORAGE_KEY, JSON.stringify(items))
}

function getCartErrorMessage(error: unknown, fallback: string) {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message
  }

  return fallback
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  const [guestItems, setGuestItems] = useState<CartItem[]>([])
  const [serverCart, setServerCart] = useState<CartView | null>(null)
  const [cityConflict, setCityConflict] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const syncInFlightRef = useRef<Promise<void> | null>(null)

  useEffect(() => {
    setGuestItems(loadGuestCart())
    setIsLoading(false)
  }, [])

  useEffect(() => {
    persistGuestCart(guestItems)
  }, [guestItems])

  const refreshCart = useCallback(async () => {
    if (!isAuthenticated) {
      setServerCart(null)
      return
    }

    const cart = await cartService.getMyCart()
    setServerCart(cart)
  }, [isAuthenticated])

  const syncGuestCartToBackend = useCallback(async () => {
    if (!isAuthenticated || guestItems.length === 0) return

    if (syncInFlightRef.current) {
      return syncInFlightRef.current
    }

    const syncPromise = (async () => {
      setIsSyncing(true)
      let remainingItems = [...guestItems]

      try {
        for (const item of guestItems) {
          await cartService.addItem(item.product.id, item.quantity)
          remainingItems = remainingItems.filter(
            (guestItem) => guestItem.product.id !== item.product.id,
          )
        }

        setGuestItems(remainingItems)
        setCityConflict(null)
        await refreshCart()
      } catch (error) {
        const message = getCartErrorMessage(
          error,
          "No pudimos sincronizar la mini-cesta con tu carrito oficial.",
        )
        toast.error(message)
        setGuestItems(remainingItems)
        await refreshCart().catch(() => undefined)
      } finally {
        setIsSyncing(false)
        syncInFlightRef.current = null
      }
    })()

    syncInFlightRef.current = syncPromise
    return syncPromise
  }, [guestItems, isAuthenticated, refreshCart])

  useEffect(() => {
    if (!isAuthenticated) {
      setServerCart(null)
      return
    }

    setIsLoading(true)
    ;(async () => {
      try {
        if (guestItems.length > 0) {
          await syncGuestCartToBackend()
        } else {
          await refreshCart()
        }
      } finally {
        setIsLoading(false)
      }
    })()
  }, [guestItems.length, isAuthenticated, refreshCart, syncGuestCartToBackend])

  const addItem = useCallback(
    async (product: Product, quantity = 1) => {
      setCityConflict(null)

      if (isAuthenticated) {
        try {
          if (guestItems.length > 0) {
            await syncGuestCartToBackend()
          }

          const cart = await cartService.addItem(product.id, quantity)
          setServerCart(cart)
          return null
        } catch (error) {
          const message = getCartErrorMessage(
            error,
            "No pudimos añadir el producto al carrito oficial.",
          )
          setCityConflict(message)
          return message
        }
      }

      if (guestItems.length > 0 && guestItems[0].product.city !== product.city) {
        const conflictMessage = `Solo puedes comprar productos de la misma ciudad. Tu carrito tiene productos de ${guestItems[0].product.city}.`
        setCityConflict(conflictMessage)
        return conflictMessage
      }

      setGuestItems((prev) => {
        const existing = prev.find((item) => item.product.id === product.id)
        if (existing) {
          return prev.map((item) =>
            item.product.id === product.id
              ? { ...item, quantity: item.quantity + quantity }
              : item,
          )
        }

        return [...prev, { product, quantity }]
      })

      return null
    },
    [guestItems, isAuthenticated, syncGuestCartToBackend],
  )

  const removeItem = useCallback(
    async (itemId: string) => {
      setCityConflict(null)

      if (isAuthenticated) {
        const cart = await cartService.removeItem(itemId)
        setServerCart(cart)
        return
      }

      setGuestItems((prev) =>
        prev.filter((item) => item.product.id !== itemId),
      )
    },
    [isAuthenticated],
  )

  const updateQuantity = useCallback(
    async (itemId: string, quantity: number) => {
      if (quantity <= 0) {
        await removeItem(itemId)
        return
      }

      if (isAuthenticated) {
        const cart = await cartService.updateItem(itemId, quantity)
        setServerCart(cart)
        return
      }

      setGuestItems((prev) =>
        prev.map((item) =>
          item.product.id === itemId ? { ...item, quantity } : item,
        ),
      )
    },
    [isAuthenticated, removeItem],
  )

  const clearCart = useCallback(async () => {
    setCityConflict(null)

    if (isAuthenticated && serverCart) {
      const ids = serverCart.providerGroups.flatMap((provider) =>
        provider.items.map((item) => item.id),
      )

      for (const itemId of ids) {
        await cartService.removeItem(itemId)
      }

      await refreshCart()
      return
    }

    setGuestItems([])
  }, [isAuthenticated, refreshCart, serverCart])

  const cart = useMemo<CartView>(() => {
    if (isAuthenticated && serverCart) {
      return serverCart
    }

    return buildGuestCartView(guestItems)
  }, [guestItems, isAuthenticated, serverCart])

  const items = useMemo(
    () => cart.providerGroups.flatMap((provider) => provider.items),
    [cart.providerGroups],
  )

  const contextValue = useMemo<CartContextType>(
    () => ({
      cart,
      providerGroups: cart.providerGroups,
      items,
      totalItems: cart.totalItems,
      totalPrice: cart.totalPrice,
      cityConflict,
      source: cart.source,
      isLoading,
      isSyncing,
      addItem,
      removeItem,
      updateQuantity,
      clearCart,
      refreshCart,
      syncGuestCartToBackend,
    }),
    [
      addItem,
      cart,
      cityConflict,
      clearCart,
      isLoading,
      isSyncing,
      items,
      refreshCart,
      removeItem,
      syncGuestCartToBackend,
      updateQuantity,
    ],
  )

  return (
    <CartContext.Provider value={contextValue}>{children}</CartContext.Provider>
  )
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error("useCart must be used within CartProvider")
  return ctx
}
