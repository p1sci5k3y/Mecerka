import { test, expect } from "../fixtures/test"

const mockedProducts = [
  {
    id: "product-1",
    name: "Cuenco Terra",
    description: "Cerámica local",
    price: "12.00",
    stock: 5,
    imageUrl: undefined,
    cityId: "city-1",
    city: { id: "city-1", name: "Sevilla", slug: "sevilla" },
    categoryId: "category-1",
    category: { id: "category-1", name: "Cerámica", slug: "ceramica" },
    providerId: "provider-1",
    provider: { id: "provider-1", name: "Taller Terra" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "product-2",
    name: "Lámpara Barrio",
    description: "Luz artesanal",
    price: "19.00",
    stock: 3,
    imageUrl: undefined,
    cityId: "city-1",
    city: { id: "city-1", name: "Sevilla", slug: "sevilla" },
    categoryId: "category-2",
    category: { id: "category-2", name: "Iluminación", slug: "iluminacion" },
    providerId: "provider-2",
    provider: { id: "provider-2", name: "Luz de Barrio" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
] as const

function createEmptyCart() {
  return {
    id: "cart-1",
    clientId: "client-1",
    cityId: null,
    status: "ACTIVE",
    city: null,
    providers: [],
  } as any
}

test.describe("official cart transition", () => {
  test("keeps a guest mini-cart and migrates it to the backend cart after login", async ({
    page,
  }) => {
    let authenticated = false
    const cartItemsPosted: Array<{ productId: string; quantity: number }> = []
    let backendCart = createEmptyCart()

    await page.route("**/products", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockedProducts),
      })
    })

    await page.route("**/auth/me", async (route) => {
      if (!authenticated) {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({
            message: "Unauthorized",
            statusCode: 401,
          }),
        })
        return
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          userId: "client-1",
          email: "buyer@example.com",
          name: "Buyer",
          roles: ["CLIENT"],
          mfaEnabled: false,
          hasPin: false,
          stripeAccountId: null,
        }),
      })
    })

    await page.route("**/auth/login", async (route) => {
      authenticated = true
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: "cookie-session-token",
          mfaRequired: false,
          user: {
            id: "client-1",
            email: "buyer@example.com",
            roles: ["CLIENT"],
            mfaEnabled: false,
            hasPin: false,
          },
        }),
      })
    })

    await page.route("**/cart/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(backendCart),
      })
    })

    await page.route("**/cart/items", async (route) => {
      const payload = route.request().postDataJSON() as {
        productId: string
        quantity: number
      }
      cartItemsPosted.push(payload)
      const product = mockedProducts.find((item) => item.id === payload.productId)!

      backendCart = {
        id: "cart-1",
        clientId: "client-1",
        cityId: product.cityId,
        status: "ACTIVE",
        city: product.city,
        providers: [
          ...backendCart.providers.filter(
            (provider: any) => provider.providerId !== product.providerId,
          ),
          {
            id: `cp-${product.providerId}`,
            providerId: product.providerId,
            subtotalAmount: Number(product.price).toFixed(2),
            itemCount: payload.quantity,
            provider: {
              id: product.providerId,
              name: product.provider.name,
            },
            items: [
              {
                id: `ci-${product.id}`,
                productId: product.id,
                quantity: payload.quantity,
                productReferenceSnapshot: product.id,
                productNameSnapshot: product.name,
                imageUrlSnapshot: null,
                unitPriceSnapshot: product.price,
                discountPriceSnapshot: null,
                effectiveUnitPriceSnapshot: product.price,
              },
            ],
          },
        ],
      }

      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(backendCart),
      })
    })

    await page.goto("/es/products")
    await page.getByRole("button", { name: /añadir/i }).first().click()

    await page.goto("/es/cart")
    await expect(page.getByText(/mini-cesta temporal/i)).toBeVisible()
    await expect(page.getByText(/cuenco terra/i)).toBeVisible()

    await page.getByRole("button", { name: /iniciar sesión y continuar/i }).click()
    await expect(page).toHaveURL(/\/es\/login\?returnTo=%2Fcart/)

    await page.getByLabel(/correo electrónico|email/i).fill("buyer@example.com")
    await page.getByLabel(/contraseña|password/i).fill("StrongPass123!")
    await page.getByRole("button", { name: /iniciar sesión|login/i }).click()

    await expect(page).toHaveURL(/\/es\/cart$/)
    await expect(page.getByText(/carrito backend oficial/i)).toBeVisible()
    await expect(page.getByText(/taller terra/i)).toBeVisible()
    await expect(page.getByText(/cuenco terra/i)).toBeVisible()

    expect(cartItemsPosted).toEqual([{ productId: "product-1", quantity: 1 }])
  })

  test("renders provider groups and sends the official checkout to /cart/checkout", async ({
    page,
  }) => {
    let authenticated = false
    let ordersEndpointHit = false
    let orderProviderSessionsHit = false
    const cartItemsPosted: Array<{ productId: string; quantity: number }> = []
    const checkoutPayloads: any[] = []
    let backendCart = createEmptyCart()

    await page.route("**/products", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockedProducts),
      })
    })

    await page.route("**/auth/me", async (route) => {
      if (!authenticated) {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({
            message: "Unauthorized",
            statusCode: 401,
          }),
        })
        return
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          userId: "client-1",
          email: "buyer@example.com",
          name: "Buyer",
          roles: ["CLIENT"],
          mfaEnabled: false,
          hasPin: false,
          stripeAccountId: null,
        }),
      })
    })

    await page.route("**/auth/login", async (route) => {
      authenticated = true
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: "cookie-session-token",
          mfaRequired: false,
          user: {
            id: "client-1",
            email: "buyer@example.com",
            roles: ["CLIENT"],
            mfaEnabled: false,
            hasPin: false,
          },
        }),
      })
    })

    await page.route("**/cart/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(backendCart),
      })
    })

    await page.route("**/cart/items", async (route) => {
      const payload = route.request().postDataJSON() as {
        productId: string
        quantity: number
      }
      cartItemsPosted.push(payload)
      const product = mockedProducts.find((item) => item.id === payload.productId)!
      const otherProviders = backendCart.providers.filter(
        (provider: any) => provider.providerId !== product.providerId,
      )
      const currentProvider = backendCart.providers.find(
        (provider: any) => provider.providerId === product.providerId,
      )
      const existingQuantity = currentProvider?.items[0]?.quantity || 0
      const nextQuantity = existingQuantity + payload.quantity
      const effectiveUnitPrice = product.id === "product-1" ? 12 : Number(product.price)
      const baseUnitPrice = product.id === "product-1" ? 15 : Number(product.price)
      const nextSubtotal = (nextQuantity * effectiveUnitPrice).toFixed(2)

      backendCart = {
        id: "cart-1",
        clientId: "client-1",
        cityId: product.cityId,
        status: "ACTIVE",
        city: product.city,
        providers: [
          ...otherProviders,
          {
            id: `cp-${product.providerId}`,
            providerId: product.providerId,
            subtotalAmount: nextSubtotal,
            itemCount: nextQuantity,
            provider: {
              id: product.providerId,
              name: product.provider.name,
            },
            items: [
              {
                id: `ci-${product.id}`,
                productId: product.id,
                quantity: nextQuantity,
                productReferenceSnapshot: product.id,
                productNameSnapshot: product.name,
                imageUrlSnapshot: null,
                unitPriceSnapshot: baseUnitPrice.toFixed(2),
                discountPriceSnapshot:
                  product.id === "product-1" ? "12.00" : null,
                effectiveUnitPriceSnapshot: effectiveUnitPrice.toFixed(2),
              },
            ],
          },
        ],
      }

      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(backendCart),
      })
    })

    await page.route("**/cart/checkout", async (route) => {
      checkoutPayloads.push(route.request().postDataJSON())
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: "order-1",
          status: "PENDING",
          cityId: "city-1",
          deliveryAddress: "Calle Real 12",
          postalCode: "41001",
          addressReference: "Portal A",
          deliveryLat: 37.389,
          deliveryLng: -5.984,
          discoveryRadiusKm: 6,
          providerOrders: [
            {
              id: "po-1",
              providerId: "provider-1",
              paymentStatus: "PENDING",
              deliveryDistanceKm: "1.2",
              coverageLimitKm: "3.0",
            },
            {
              id: "po-2",
              providerId: "provider-2",
              paymentStatus: "PENDING",
              deliveryDistanceKm: "1.6",
              coverageLimitKm: "3.0",
            },
          ],
        }),
      })
    })

    await page.route("**/orders/order-1", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "order-1",
          totalPrice: "31.00",
          deliveryFee: "0.00",
          status: "PENDING",
          createdAt: "2026-01-01T00:00:00.000Z",
          city: { id: "city-1", name: "Sevilla", slug: "sevilla" },
          deliveryAddress: "Calle Real 12",
          postalCode: "41001",
          addressReference: "Portal A",
          deliveryLat: 37.389,
          deliveryLng: -5.984,
          discoveryRadiusKm: 6,
          deliveryOrder: null,
          providerOrders: [
            {
              id: "po-1",
              providerId: "provider-1",
              provider: { id: "provider-1", name: "Taller Terra" },
              status: "PENDING",
              paymentStatus: "PENDING",
              subtotalAmount: "12.00",
              items: [
                {
                  id: "oi-1",
                  productId: "product-1",
                  quantity: 1,
                  priceAtPurchase: "12.00",
                  unitBasePriceSnapshot: "15.00",
                  discountPriceSnapshot: "12.00",
                  product: {
                    ...mockedProducts[0],
                    discountPrice: "12.00",
                    price: "15.00",
                  },
                },
              ],
            },
            {
              id: "po-2",
              providerId: "provider-2",
              provider: { id: "provider-2", name: "Luz de Barrio" },
              status: "PENDING",
              paymentStatus: "PENDING",
              subtotalAmount: "19.00",
              items: [
                {
                  id: "oi-2",
                  productId: "product-2",
                  quantity: 1,
                  priceAtPurchase: "19.00",
                  unitBasePriceSnapshot: "19.00",
                  discountPriceSnapshot: null,
                  product: mockedProducts[1],
                },
              ],
            },
          ],
        }),
      })
    })

    await page.route("**/payments/orders/order-1/provider-sessions", async (route) => {
      orderProviderSessionsHit = true
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          orderId: "order-1",
          orderStatus: "PENDING",
          paymentMode: "PROVIDER_ORDER_SESSIONS",
          providerPaymentStatus: "UNPAID",
          paidProviderOrders: 0,
          totalProviderOrders: 2,
          providerOrders: [
            {
              providerOrderId: "po-1",
              providerId: "provider-1",
              providerName: "Taller Terra",
              subtotalAmount: "12.00",
              originalSubtotalAmount: "15.00",
              discountAmount: "3.00",
              status: "PAYMENT_READY",
              paymentStatus: "PAYMENT_READY",
              paymentRequired: true,
              paymentSession: {
                providerOrderId: "po-1",
                paymentSessionId: "session-1",
                externalSessionId: "pi_1",
                clientSecret: "pi_1_secret",
                stripeAccountId: "acct_provider_1",
                expiresAt: "2026-01-01T01:00:00.000Z",
                paymentStatus: "PAYMENT_READY",
              },
            },
            {
              providerOrderId: "po-2",
              providerId: "provider-2",
              providerName: "Luz de Barrio",
              subtotalAmount: "19.00",
              originalSubtotalAmount: "19.00",
              discountAmount: "0.00",
              status: "PAYMENT_READY",
              paymentStatus: "PAYMENT_READY",
              paymentRequired: true,
              paymentSession: {
                providerOrderId: "po-2",
                paymentSessionId: "session-2",
                externalSessionId: "pi_2",
                clientSecret: "pi_2_secret",
                stripeAccountId: "acct_provider_2",
                expiresAt: "2026-01-01T01:00:00.000Z",
                paymentStatus: "PAYMENT_READY",
              },
            },
          ],
          runnerPayment: {
            paymentMode: "DELIVERY_ORDER_SESSION",
            deliveryOrderId: null,
            runnerId: null,
            deliveryStatus: null,
            paymentStatus: "NOT_CREATED",
            paymentRequired: false,
            sessionPrepared: false,
            amount: "5.18",
            currency: "EUR",
            pricingDistanceKm: "0.20",
            pickupCount: 2,
            additionalPickupCount: 1,
            baseFee: "3.50",
            perKmFee: "0.90",
            distanceFee: "0.18",
            extraPickupFee: "1.50",
            extraPickupCharge: "1.50",
          },
        }),
      })
    })

    await page.route("**/orders", async (route) => {
      ordersEndpointHit = true
      await route.abort()
    })

    await page.goto("/es/products")
    const addButtons = page.getByRole("button", { name: /añadir/i })
    await addButtons.nth(0).click()
    await addButtons.nth(1).click()

    await page.goto("/es/cart")
    await expect(page.getByText(/cuenco terra/i)).toBeVisible()
    await expect(page.getByText(/lámpara barrio/i)).toBeVisible()

    await page.getByRole("button", { name: /iniciar sesión y continuar/i }).click()
    await page.getByLabel(/correo electrónico|email/i).fill("buyer@example.com")
    await page.getByLabel(/contraseña|password/i).fill("StrongPass123!")
    await page.getByRole("button", { name: /iniciar sesión|login/i }).click()

    await expect(page).toHaveURL(/\/es\/cart$/)
    await expect(page.getByText(/taller terra/i)).toBeVisible()
    await expect(page.getByText(/luz de barrio/i)).toBeVisible()
    await expect(page.getByText(/descuento del proveedor/i)).toBeVisible()

    await page.getByLabel(/dirección de entrega/i).fill("Calle Real 12")
    await page.getByLabel(/código postal/i).fill("41001")
    await page.getByLabel(/referencia adicional/i).fill("Portal A")
    await page.getByLabel(/radio de compra/i).fill("6")
    await page.getByRole("button", { name: /crear pedido oficial/i }).click()

    await expect(page).toHaveURL(/\/es\/orders\/order-1\/payments$/)
    await expect(
      page.getByRole("heading", { name: /pedido y pagos por comercio/i }),
    ).toBeVisible()
    await expect(page.getByText(/taller terra/i).first()).toBeVisible()
    await expect(page.getByText(/luz de barrio/i).first()).toBeVisible()
    await expect(page.getByText(/descuento aplicado por este comercio/i)).toBeVisible()
    await expect(page.getByText(/pago separado del reparto/i)).toBeVisible()
    await expect(page.getByText(/importe oficial del reparto/i)).toBeVisible()
    await expect(
      page.getByRole("button", {
        name: /revisar pago de este comercio/i,
      }).first(),
    ).toBeVisible()

    expect(cartItemsPosted).toEqual([
      { productId: "product-1", quantity: 1 },
      { productId: "product-2", quantity: 1 },
    ])
    expect(checkoutPayloads).toEqual([
      {
        cityId: "city-1",
        deliveryAddress: "Calle Real 12",
        postalCode: "41001",
        addressReference: "Portal A",
        discoveryRadiusKm: 6,
      },
    ])
    expect(ordersEndpointHit).toBe(false)
    expect(orderProviderSessionsHit).toBe(true)
  })
})
