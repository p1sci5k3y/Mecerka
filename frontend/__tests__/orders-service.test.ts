import { beforeEach, describe, expect, it, vi } from "vitest"
import { ordersService } from "@/lib/services/orders-service"
import type { BackendOrder } from "@/lib/types"

const apiGetMock = vi.fn()
const apiPostMock = vi.fn()
const apiPatchMock = vi.fn()

vi.mock("@/lib/api", () => ({
  api: {
    get: (...args: unknown[]) => apiGetMock(...args),
    post: (...args: unknown[]) => apiPostMock(...args),
    patch: (...args: unknown[]) => apiPatchMock(...args),
  },
}))

function makeBackendOrder(): BackendOrder {
  return {
    id: "99",
    totalPrice: "35.50",
    deliveryFee: "4.50",
    status: "PENDING",
    createdAt: "2026-03-24T10:00:00.000Z",
    deliveryAddress: "Calle Luna 4",
    postalCode: "28004",
    addressReference: null,
    deliveryLat: 40.4,
    deliveryLng: -3.7,
    discoveryRadiusKm: 5,
    deliveryDistanceKm: "2.4",
    runnerBaseFee: "2.00",
    runnerPerKmFee: "0.75",
    runnerExtraPickupFee: "1.00",
    city: { id: "city-1", name: "Madrid", slug: "madrid" },
    items: [
      {
        id: "1",
        productId: "10",
        quantity: 1,
        priceAtPurchase: "8.50",
        unitBasePriceSnapshot: "10.00",
        discountPriceSnapshot: "8.50",
        product: {
          id: "10",
          name: "Cuenco azul",
          description: "Hecho a mano",
          price: "10.00",
          discountPrice: "8.50",
          stock: 3,
          cityId: "city-1",
          providerId: "8",
          categoryId: "cat-1",
          createdAt: "2026-03-20T10:00:00.000Z",
          updatedAt: "2026-03-20T10:00:00.000Z",
          city: { id: "city-1", name: "Madrid", slug: "madrid" },
          category: { id: "cat-1", name: "Ceramica", slug: "ceramica" },
        },
      },
    ],
    providerOrders: [
      {
        id: "201",
        providerId: "8",
        status: "PREPARING",
        paymentStatus: "UNPAID",
        subtotalAmount: "27.00",
        createdAt: "2026-03-24T10:00:00.000Z",
        provider: { id: "8", name: "Taller Mar" },
        items: [
          {
            id: "2",
            productId: "11",
            quantity: 2,
            priceAtPurchase: "13.50",
            unitBasePriceSnapshot: "15.00",
            discountPriceSnapshot: "13.50",
            product: {
              id: "11",
              name: "Lampara",
              price: "15.00",
              discountPrice: "13.50",
              stock: 4,
              cityId: "city-1",
              providerId: "8",
              categoryId: "cat-1",
              createdAt: "2026-03-21T09:00:00.000Z",
              updatedAt: "2026-03-21T09:00:00.000Z",
            },
          },
        ],
      },
    ],
    deliveryOrder: {
      id: "300",
      runnerId: "runner-1",
      status: "ASSIGNED",
      paymentStatus: "UNPAID",
    },
  }
}

describe("orders-service", () => {
  beforeEach(() => {
    apiGetMock.mockReset()
    apiPostMock.mockReset()
    apiPatchMock.mockReset()
  })

  it("normalizes a single order with flattened items, delivery fees and provider orders", async () => {
    apiGetMock.mockResolvedValueOnce(makeBackendOrder())

    const order = await ordersService.getOne(99)

    expect(apiGetMock).toHaveBeenCalledWith("/orders/99")
    expect(order).toMatchObject({
      id: "99",
      total: 35.5,
      deliveryFee: 4.5,
      city: "Madrid",
      deliveryDistanceKm: 2.4,
      runnerBaseFee: 2,
      runnerPerKmFee: 0.75,
      runnerExtraPickupFee: 1,
    })
    expect(order.items).toHaveLength(2)
    expect(order.items[0]).toMatchObject({
      id: "1",
      productId: "10",
      baseUnitPrice: 10,
      unitPrice: 8.5,
      discountAmount: 1.5,
    })
    expect(order.providerOrders?.[0]).toMatchObject({
      id: "201",
      providerId: "8",
      providerName: "Taller Mar",
      subtotal: 27,
      originalSubtotal: 30,
      discountAmount: 3,
      status: "PREPARING",
    })
    expect(order.providerOrders?.[0].items[0].product).toMatchObject({
      city: "N/A",
      category: "N/A",
    })
  })

  it("falls back to zero delivery fee when backend value is invalid", async () => {
    const backendOrder = makeBackendOrder()
    backendOrder.deliveryFee = "nope"
    apiGetMock.mockResolvedValueOnce([backendOrder])

    const orders = await ordersService.getAll()

    expect(orders[0].deliveryFee).toBe(0)
  })

  it("creates orders with the backend payload shape", async () => {
    apiPostMock.mockResolvedValueOnce(makeBackendOrder())

    const order = await ordersService.create({
      items: [{ productId: "10", quantity: 2 }],
      deliveryAddress: "Calle Sol 3",
    })

    expect(apiPostMock).toHaveBeenCalledWith("/orders", {
      items: [{ productId: "10", quantity: 2 }],
      deliveryAddress: "Calle Sol 3",
    })
    expect(order.id).toBe("99")
  })

  it("forwards provider order status updates through the api", async () => {
    apiPatchMock.mockResolvedValueOnce({ ok: true })

    await ordersService.updateProviderOrderStatus("po-1", "READY_FOR_PICKUP")

    expect(apiPatchMock).toHaveBeenCalledWith(
      "/orders/provider-order/po-1/status",
      { status: "READY_FOR_PICKUP" },
    )
  })

  it("forwards provider analytics endpoints without extra transformation", async () => {
    apiGetMock
      .mockResolvedValueOnce({ totalRevenue: 10, totalOrders: 2, itemsSold: 3, averageTicket: 5 })
      .mockResolvedValueOnce([{ date: "2026-03-27", amount: 10 }])
      .mockResolvedValueOnce([{ name: "Cuenco", quantity: 2, revenue: 20 }])

    const stats = await ordersService.getProviderStats()
    const chart = await ordersService.getSalesChart()
    const topProducts = await ordersService.getTopProducts()

    expect(apiGetMock).toHaveBeenNthCalledWith(1, "/orders/provider/stats")
    expect(apiGetMock).toHaveBeenNthCalledWith(2, "/orders/provider/chart")
    expect(apiGetMock).toHaveBeenNthCalledWith(3, "/orders/provider/top-products")
    expect(stats.totalRevenue).toBe(10)
    expect(chart[0].amount).toBe(10)
    expect(topProducts[0].name).toBe("Cuenco")
  })

  it("maps available orders and forwards runner lifecycle transitions", async () => {
    const backendOrder = makeBackendOrder() as any
    delete backendOrder.deliveryFee
    delete backendOrder.deliveryDistanceKm
    delete backendOrder.runnerBaseFee
    delete backendOrder.runnerPerKmFee
    delete backendOrder.runnerExtraPickupFee
    delete backendOrder.providerOrders
    delete backendOrder.items
    backendOrder.deliveryOrder = null
    delete backendOrder.city

    apiGetMock.mockResolvedValueOnce([backendOrder])
    apiPatchMock
      .mockResolvedValueOnce({ id: "99", status: "ACCEPTED" })
      .mockResolvedValueOnce({ id: "99", status: "IN_TRANSIT" })
      .mockResolvedValueOnce({ id: "99", status: "DELIVERED" })

    const available = await ordersService.getAvailable()
    await ordersService.accept("99")
    await ordersService.markInTransit("99")
    await ordersService.complete("99")

    expect(apiGetMock).toHaveBeenCalledWith("/orders/available")
    expect(available[0]).toMatchObject({
      id: "99",
      deliveryFee: 0,
      city: undefined,
      providerOrders: [],
      items: [],
      deliveryOrder: null,
    })
    expect(apiPatchMock).toHaveBeenNthCalledWith(1, "/orders/99/accept")
    expect(apiPatchMock).toHaveBeenNthCalledWith(2, "/orders/99/in-transit")
    expect(apiPatchMock).toHaveBeenNthCalledWith(3, "/orders/99/complete")
  })
})
