import { beforeEach, describe, expect, it, vi } from "vitest"
import { cartService, transformBackendCart } from "@/lib/services/cart-service"
import type { BackendCartGroup } from "@/lib/types"

const apiGetMock = vi.fn()
const apiPostMock = vi.fn()
const apiPatchMock = vi.fn()
const apiDeleteMock = vi.fn()

vi.mock("@/lib/api", () => ({
  api: {
    get: (...args: unknown[]) => apiGetMock(...args),
    post: (...args: unknown[]) => apiPostMock(...args),
    patch: (...args: unknown[]) => apiPatchMock(...args),
    delete: (...args: unknown[]) => apiDeleteMock(...args),
  },
}))

function makeBackendCart(): BackendCartGroup {
  return {
    id: "cart-1",
    cityId: "city-1",
    city: { id: "city-1", name: "Madrid" },
    providers: [
      {
        id: "provider-group-1",
        providerId: "provider-1",
        itemCount: 3,
        subtotalAmount: "17.50",
        provider: { id: "provider-1", name: "Taller Norte" },
        items: [
          {
            id: "line-1",
            productId: "10",
            productNameSnapshot: "Jarron artesanal",
            quantity: 2,
            unitPriceSnapshot: "5.00",
            effectiveUnitPriceSnapshot: "4.50",
            discountPriceSnapshot: "4.50",
            imageUrlSnapshot: "https://img.test/jarron.jpg",
          },
          {
            id: "line-2",
            productId: "11",
            productNameSnapshot: "Cuenco",
            quantity: 1,
            unitPriceSnapshot: "8.50",
            effectiveUnitPriceSnapshot: "8.50",
            discountPriceSnapshot: null,
            imageUrlSnapshot: null,
          },
        ],
      },
    ],
  } as BackendCartGroup
}

describe("cart-service", () => {
  beforeEach(() => {
    apiGetMock.mockReset()
    apiPostMock.mockReset()
    apiPatchMock.mockReset()
    apiDeleteMock.mockReset()
  })

  it("transforms backend carts into grouped cart views with discounts", () => {
    const cart = transformBackendCart(makeBackendCart())

    expect(cart).toMatchObject({
      id: "cart-1",
      cityId: "city-1",
      cityName: "Madrid",
      totalItems: 3,
      totalPrice: 17.5,
      originalTotalPrice: 18.5,
      discountAmount: 1,
      source: "server",
    })
    expect(cart.providerGroups[0]).toMatchObject({
      providerId: "provider-1",
      providerName: "Taller Norte",
      subtotalAmount: 17.5,
      originalSubtotalAmount: 18.5,
      discountAmount: 1,
      itemCount: 3,
    })
    expect(cart.providerGroups[0].items[0]).toMatchObject({
      id: "line-1",
      productId: "10",
      unitPrice: 4.5,
      baseUnitPrice: 5,
      appliedDiscountUnitPrice: 4.5,
      subtotal: 9,
      originalSubtotal: 10,
      source: "server",
    })
  })

  it("falls back to a placeholder city name when backend city is missing", () => {
    const backendCart = makeBackendCart()
    backendCart.city = null

    const cart = transformBackendCart(backendCart)

    expect(cart.cityName).toBeNull()
    expect(cart.providerGroups[0].items[0].product.city).toBe("Desconocida")
  })

  it("hydrates the current cart through the api service", async () => {
    apiGetMock.mockResolvedValueOnce(makeBackendCart())

    const cart = await cartService.getMyCart()

    expect(apiGetMock).toHaveBeenCalledWith("/cart/me")
    expect(cart.totalPrice).toBe(17.5)
  })

  it("sends checkout idempotency header and normalizes numeric fields", async () => {
    apiPostMock.mockResolvedValueOnce({
      id: 77,
      status: "PENDING",
      cityId: "city-1",
      deliveryAddress: "Calle Mayor 1",
      postalCode: "28001",
      addressReference: null,
      deliveryLat: null,
      deliveryLng: null,
      discoveryRadiusKm: "7.5",
      providerOrders: [
        {
          id: 501,
          providerId: 12,
          paymentStatus: "UNPAID",
          deliveryDistanceKm: "2.8",
          coverageLimitKm: "8.5",
        },
      ],
    })

    const result = await cartService.checkout(
      {
        cityId: "city-1",
        deliveryAddress: "Calle Mayor 1",
        postalCode: "28001",
        discoveryRadiusKm: 7.5,
      },
      "idem-1",
    )

    expect(apiPostMock).toHaveBeenCalledWith(
      "/cart/checkout",
      {
        cityId: "city-1",
        deliveryAddress: "Calle Mayor 1",
        postalCode: "28001",
        discoveryRadiusKm: 7.5,
      },
      {
        headers: {
          "Idempotency-Key": "idem-1",
        },
      },
    )
    expect(result).toEqual({
      id: "77",
      status: "PENDING",
      cityId: "city-1",
      deliveryAddress: "Calle Mayor 1",
      postalCode: "28001",
      addressReference: null,
      deliveryLat: null,
      deliveryLng: null,
      discoveryRadiusKm: 7.5,
      providerOrders: [
        {
          id: "501",
          providerId: "12",
          paymentStatus: "UNPAID",
          deliveryDistanceKm: 2.8,
          coverageLimitKm: 8.5,
        },
      ],
    })
  })
})
