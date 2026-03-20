import { api } from "@/lib/api"
import type {
  BackendCartGroup,
  BackendCartItem,
  CartLineItem,
  CartProviderGroup,
  CartView,
  CheckoutOrderResult,
  CheckoutCartPayload,
  Product,
} from "@/lib/types"

function mapCartItem(
  item: BackendCartItem,
  cityName: string | null,
  providerId: string,
  providerName: string,
): CartLineItem {
  const unitPrice = Number.parseFloat(item.effectiveUnitPriceSnapshot)
  const baseUnitPrice = Number.parseFloat(item.unitPriceSnapshot)
  const appliedDiscountUnitPrice =
    item.discountPriceSnapshot != null
      ? Number.parseFloat(item.discountPriceSnapshot)
      : null
  const discountAmount = Math.max(baseUnitPrice - unitPrice, 0)
  const product: Product = {
    id: String(item.productId),
    name: item.productNameSnapshot,
    description: "",
    price: unitPrice,
    basePrice: baseUnitPrice,
    discountPrice: appliedDiscountUnitPrice,
    stock: 0,
    city: cityName || "Desconocida",
    category: "General",
    imageUrl: item.imageUrlSnapshot || undefined,
    providerId,
    provider: {
      name: providerName,
    },
    createdAt: "",
  }

  return {
    id: String(item.id),
    productId: String(item.productId),
    quantity: item.quantity,
    unitPrice,
    baseUnitPrice,
    appliedDiscountUnitPrice,
    discountAmount,
    subtotal: unitPrice * item.quantity,
    originalSubtotal: baseUnitPrice * item.quantity,
    product,
    source: "server",
  }
}

function mapCartProviderGroup(
  provider: BackendCartGroup["providers"][number],
  cityName: string | null,
): CartProviderGroup {
  const items = provider.items.map((item) =>
    mapCartItem(item, cityName, provider.providerId, provider.provider.name),
  )

  return {
    id: provider.id,
    providerId: provider.providerId,
    providerName: provider.provider.name,
    subtotalAmount: Number.parseFloat(provider.subtotalAmount),
    originalSubtotalAmount: items.reduce(
      (sum, item) => sum + item.originalSubtotal,
      0,
    ),
    discountAmount: items.reduce(
      (sum, item) => sum + item.discountAmount * item.quantity,
      0,
    ),
    itemCount: provider.itemCount,
    items,
  }
}

export function transformBackendCart(cart: BackendCartGroup): CartView {
  const cityName = cart.city?.name ?? null
  const providerGroups = cart.providers.map((provider) =>
    mapCartProviderGroup(provider, cityName),
  )
  const totalItems = providerGroups.reduce(
    (sum, provider) => sum + provider.itemCount,
    0,
  )
  const totalPrice = providerGroups.reduce(
    (sum, provider) => sum + provider.subtotalAmount,
    0,
  )
  const originalTotalPrice = providerGroups.reduce(
    (sum, provider) => sum + provider.originalSubtotalAmount,
    0,
  )

  return {
    id: cart.id,
    cityId: cart.cityId ?? null,
    cityName,
    providerGroups,
    totalItems,
    totalPrice,
    originalTotalPrice,
    discountAmount: Math.max(originalTotalPrice - totalPrice, 0),
    source: "server",
  }
}

export const cartService = {
  async getMyCart() {
    const data = await api.get<BackendCartGroup>("/cart/me")
    return transformBackendCart(data)
  },

  async addItem(productId: string, quantity: number) {
    const data = await api.post<BackendCartGroup>("/cart/items", {
      productId,
      quantity,
    })
    return transformBackendCart(data)
  },

  async updateItem(itemId: string, quantity: number) {
    const data = await api.patch<BackendCartGroup>(`/cart/items/${itemId}`, {
      quantity,
    })
    return transformBackendCart(data)
  },

  async removeItem(itemId: string) {
    const data = await api.delete<BackendCartGroup>(`/cart/items/${itemId}`)
    return transformBackendCart(data)
  },

  async checkout(payload: CheckoutCartPayload, idempotencyKey: string) {
    const data = await api.post<any>("/cart/checkout", payload, {
      headers: {
        "Idempotency-Key": idempotencyKey,
      },
    })

    return {
      id: String(data.id),
      status: data.status,
      cityId: data.cityId,
      deliveryAddress: data.deliveryAddress,
      postalCode: data.postalCode ?? null,
      addressReference: data.addressReference ?? null,
      deliveryLat: data.deliveryLat ?? null,
      deliveryLng: data.deliveryLng ?? null,
      discoveryRadiusKm:
        typeof data.discoveryRadiusKm === "number"
          ? data.discoveryRadiusKm
          : data.discoveryRadiusKm != null
            ? Number(data.discoveryRadiusKm)
            : null,
      providerOrders: Array.isArray(data.providerOrders)
        ? data.providerOrders.map((providerOrder: any) => ({
            id: String(providerOrder.id),
            providerId: String(providerOrder.providerId),
            paymentStatus: providerOrder.paymentStatus,
            deliveryDistanceKm:
              providerOrder.deliveryDistanceKm != null
                ? Number(providerOrder.deliveryDistanceKm)
                : null,
            coverageLimitKm:
              providerOrder.coverageLimitKm != null
                ? Number(providerOrder.coverageLimitKm)
                : null,
          }))
        : [],
    } satisfies CheckoutOrderResult
  },
}
