import { api } from "@/lib/api"
import type { Order, BackendOrder, CreateOrderPayload } from "@/lib/types"

function transformOrder(bo: BackendOrder): Order {
  return {
    id: String(bo.id),
    userId: "Unknown",
    total: Number.parseFloat(bo.totalPrice),
    status: bo.status,
    createdAt: bo.createdAt,
    city: bo.city?.name,
    items: bo.items?.map(item => ({
      id: String(item.id),
      productId: String(item.productId),
      quantity: item.quantity,
      unitPrice: Number.parseFloat(item.priceAtPurchase),
      product: item.product ? {
        id: String(item.product.id),
        name: item.product.name,
        description: item.product.description || "",
        price: Number.parseFloat(item.product.price),
        stock: item.product.stock,
        city: item.product.city?.name || "N/A",
        category: item.product.category?.name || "N/A",
        providerId: String(item.product.providerId),
        createdAt: item.product.createdAt
      } : undefined
    })) || []
  }
}

export const ordersService = {
  create: async (payload: CreateOrderPayload) => {
    // Transform payload for backend: wrapper { items: [...] } is expected by backend?
    // Backend expects { items: [{ productId, quantity }] }.
    // Payload IS { items: [...] }.
    // But backend expects productId as NUMBER?
    // CartPage sends string IDs (from Product.id which is string in adapter).

    // We need to map strings to numbers if Backend needs numbers.
    const backendPayload = {
      items: payload.items.map(i => ({
        productId: Number.parseInt(i.productId),
        quantity: i.quantity
      })),
      ...(payload.deliveryAddress && { deliveryAddress: payload.deliveryAddress })
    }

    const res = await api.post<BackendOrder>("/orders", backendPayload)
    return transformOrder(res)
  },
  getAll: async () => {
    const data = await api.get<BackendOrder[]>("/orders")
    return data.map(transformOrder)
  },
  getOne: async (id: number | string) => {
    const data = await api.get<BackendOrder>(`/orders/${id}`)
    return transformOrder(data)
  },
  getProviderStats: async () => {
    return api.get<import("@/lib/types").ProviderStats>("/orders/provider/stats")
  },
  getSalesChart: async () => {
    return api.get<import("@/lib/types").SalesChartData[]>("/orders/provider/chart")
  },
  getTopProducts: async () => {
    return api.get<import("@/lib/types").TopProduct[]>("/orders/provider/top-products")
  },
  getAvailable: async () => {
    const data = await api.get<BackendOrder[]>("/orders/available")
    return data.map(transformOrder)
  },
  accept: async (id: string) => {
    return api.patch<BackendOrder>(`/orders/${id}/accept`)
  },
  complete: async (id: string) => {
    return api.patch<BackendOrder>(`/orders/${id}/complete`)
  }
}
