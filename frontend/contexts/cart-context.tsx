"use client"

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react"
import type { Product, CartItem } from "@/lib/types"

interface CartContextType {
  items: CartItem[]
  totalItems: number
  totalPrice: number
  addItem: (product: Product, quantity?: number) => void
  removeItem: (productId: string) => void
  updateQuantity: (productId: string, quantity: number) => void
  clearCart: () => void
  cityConflict: string | null
}

const CartContext = createContext<CartContextType | undefined>(undefined)

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [cityConflict, setCityConflict] = useState<string | null>(null)

  const addItem = useCallback(
    (product: Product, quantity = 1) => {
      setCityConflict(null)
      setItems((prev) => {
        // Validate same city
        if (prev.length > 0 && prev[0].product.city !== product.city) {
          setCityConflict(
            `Solo puedes comprar productos de la misma ciudad. Tu carrito tiene productos de ${prev[0].product.city}.`
          )
          return prev
        }

        const existing = prev.find((i) => i.product.id === product.id)
        if (existing) {
          return prev.map((i) =>
            i.product.id === product.id
              ? { ...i, quantity: i.quantity + quantity }
              : i
          )
        }
        return [...prev, { product, quantity }]
      })
    },
    []
  )

  const removeItem = useCallback((productId: string) => {
    setItems((prev) => prev.filter((i) => i.product.id !== productId))
    setCityConflict(null)
  }, [])

  const updateQuantity = useCallback((productId: string, quantity: number) => {
    if (quantity <= 0) {
      setItems((prev) => prev.filter((i) => i.product.id !== productId))
      return
    }
    setItems((prev) =>
      prev.map((i) =>
        i.product.id === productId ? { ...i, quantity } : i
      )
    )
  }, [])

  const clearCart = useCallback(() => {
    setItems([])
    setCityConflict(null)
  }, [])

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0)
  const totalPrice = items.reduce(
    (sum, i) => sum + i.product.price * i.quantity,
    0
  )

  return (
    <CartContext.Provider
      value={{
        items,
        totalItems,
        totalPrice,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        cityConflict,
      }}
    >
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error("useCart must be used within CartProvider")
  return ctx
}
