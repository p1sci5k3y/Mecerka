import { api } from "@/lib/api"
import type { Order, BackendOrder, CreateOrderPayload, OrderItem } from "@/lib/types"

function transformOrder(bo: BackendOrder): Order {
  // If backend returns items directly (e.g., from an old endpoint) vs nested providerOrders
  const flattenedItems: OrderItem[] = []

  if (bo.items) {
    flattenedItems.push(...bo.items.map(mapBackendItem))
  }

  if (bo.providerOrders) {
    bo.providerOrders.forEach(po => {
      if (po.items) {
        flattenedItems.push(...po.items.map(mapBackendItem))
      }
    })
  }

  return {
    id: String(bo.id),
    userId: "Unknown",
    total: Number.parseFloat(bo.totalPrice),
    deliveryFee: (() => {
      if (!bo.deliveryFee) return 0;
      const df = Number.parseFloat(bo.deliveryFee);
      return Number.isNaN(df) ? 0 : df;
    })(),
    status: bo.status,
    createdAt: bo.createdAt,
    updatedAt: bo.updatedAt || bo.createdAt,
    city: bo.city?.name,
    deliveryAddress: (bo as any).deliveryAddress, // Typings might need this if we don't map it everywhere
    deliveryLat: bo.deliveryLat,
    deliveryLng: bo.deliveryLng,
    items: flattenedItems,
    providerOrders: bo.providerOrders?.map(po => ({
      id: String(po.id),
      providerId: String(po.providerId),
      status: po.status,
      subtotal: Number.parseFloat(po.subtotal),
      items: (po.items || []).map(mapBackendItem),
      createdAt: po.createdAt,
      updatedAt: po.updatedAt || po.createdAt
    })) || []
  }
}

function mapBackendItem(item: any): OrderItem {
  return {
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
  }
}

export const ordersService = {
  create: async (payload: CreateOrderPayload) => {
    const backendPayload = {
      items: payload.items.map(i => ({
        productId: i.productId,
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
  updateProviderOrderStatus: async (providerOrderId: string, status: string) => {
    return api.patch(`/orders/provider-order/${providerOrderId}/status`, { status })
  },
  accept: async (id: string) => {
    return api.patch<BackendOrder>(`/orders/${id}/accept`)
  },
  markInTransit: async (id: string) => {
    return api.patch<BackendOrder>(`/orders/${id}/in-transit`)
  },
  complete: async (id: string) => {
    return api.patch<BackendOrder>(`/orders/${id}/complete`)
  }
}
