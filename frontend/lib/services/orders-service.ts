import { api } from "@/lib/api"
import type {
  BackendOrder,
  BackendOrderItem,
  CreateOrderPayload,
  Order,
  OrderItem,
  OrderTrackingSnapshot,
} from "@/lib/types"

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
    deliveryAddress: bo.deliveryAddress,
    postalCode: bo.postalCode,
    addressReference: bo.addressReference ?? null,
    deliveryLat: bo.deliveryLat,
    deliveryLng: bo.deliveryLng,
    discoveryRadiusKm: bo.discoveryRadiusKm ?? undefined,
    deliveryDistanceKm:
      bo.deliveryDistanceKm != null ? Number.parseFloat(bo.deliveryDistanceKm) : undefined,
    runnerBaseFee:
      bo.runnerBaseFee != null ? Number.parseFloat(bo.runnerBaseFee) : undefined,
    runnerPerKmFee:
      bo.runnerPerKmFee != null ? Number.parseFloat(bo.runnerPerKmFee) : undefined,
    runnerExtraPickupFee:
      bo.runnerExtraPickupFee != null
        ? Number.parseFloat(bo.runnerExtraPickupFee)
        : undefined,
    deliveryOrder: bo.deliveryOrder
      ? {
          id: String(bo.deliveryOrder.id),
          runnerId: bo.deliveryOrder.runnerId,
          status: bo.deliveryOrder.status,
          paymentStatus: bo.deliveryOrder.paymentStatus,
        }
      : null,
    items: flattenedItems,
    providerOrders:
      bo.providerOrders?.map((po) => {
        const items = (po.items || []).map(mapBackendItem)
        const originalSubtotal = items.reduce(
          (sum, item) => sum + item.baseUnitPrice * item.quantity,
          0,
        )
        const subtotal = Number.parseFloat(po.subtotalAmount)

        return {
          id: String(po.id),
          providerId: String(po.providerId),
          providerName: po.provider?.name,
          status: po.status,
          paymentStatus: po.paymentStatus,
          subtotal,
          originalSubtotal,
          discountAmount: Math.max(originalSubtotal - subtotal, 0),
          items,
          createdAt: po.createdAt,
          updatedAt: po.updatedAt || po.createdAt,
        }
      }) || []
  }
}

function mapBackendItem(item: BackendOrderItem): OrderItem {
  const baseUnitPrice =
    item.unitBasePriceSnapshot != null
      ? Number.parseFloat(item.unitBasePriceSnapshot)
      : Number.parseFloat(item.priceAtPurchase)
  const unitPrice = Number.parseFloat(item.priceAtPurchase)
  const appliedDiscountUnitPrice =
    item.discountPriceSnapshot != null
      ? Number.parseFloat(item.discountPriceSnapshot)
      : baseUnitPrice > unitPrice
        ? unitPrice
        : null

  return {
    id: String(item.id),
    productId: String(item.productId),
    quantity: item.quantity,
    unitPrice,
    baseUnitPrice,
    appliedDiscountUnitPrice,
    discountAmount: Math.max(baseUnitPrice - unitPrice, 0),
    priceAtPurchase: item.priceAtPurchase,
    product: item.product ? {
      id: String(item.product.id),
      name: item.product.name,
      description: item.product.description || "",
      price:
        item.product.discountPrice != null
          ? Number.parseFloat(item.product.discountPrice)
          : Number.parseFloat(item.product.price),
      basePrice: Number.parseFloat(item.product.price),
      discountPrice:
        item.product.discountPrice != null
          ? Number.parseFloat(item.product.discountPrice)
          : null,
      stock: item.product.stock,
      city: item.product.city?.name || "N/A",
      category: item.product.category?.name || "N/A",
      imageUrl: item.product.imageUrl ?? undefined,
      providerId: String(item.product.providerId),
      provider: item.product.provider
        ? {
            name: item.product.provider.name,
          }
        : undefined,
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
  getTracking: async (id: number | string) => {
    return api.get<OrderTrackingSnapshot>(`/orders/${id}/tracking`)
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
