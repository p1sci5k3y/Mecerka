import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  DeliveryStatus,
  ProviderOrderStatus,
  ProviderPaymentStatus,
  Role,
} from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  authHeader,
  closeTestApp,
  createCatalogFixture,
  createProductFixture,
  createTestApp,
  createTestUser,
  loginAndGetToken,
  truncateDatabase,
} from './helpers/e2e-test-helpers';

describe('Official Cart Checkout (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const geocodingService = {
    geocodeAddress: jest.fn(
      async ({
        streetAddress,
      }: {
        streetAddress: string;
        postalCode: string;
        cityName: string;
      }) => {
        if (streetAddress.includes('UNGEO')) {
          return null;
        }

        if (streetAddress.includes('FAR')) {
          return {
            latitude: 40.5201,
            longitude: -3.81,
            formattedAddress: 'Far address',
          };
        }

        return {
          latitude: 40.4168,
          longitude: -3.7038,
          formattedAddress: 'Calle Mayor 1, 28013 Madrid, Spain',
        };
      },
    ),
  };

  const validCheckoutPayload = (cityId: string) => ({
    cityId,
    deliveryAddress: 'Calle Mayor 1',
    postalCode: '28013',
    addressReference: 'Portal 2',
    discoveryRadiusKm: 6,
  });

  beforeAll(async () => {
    const testApp = await createTestApp({ geocodingService });
    app = testApp.app;
    prisma = testApp.prisma;
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  beforeEach(() => {
    geocodingService.geocodeAddress.mockClear();
  });

  it('fails official checkout without deliveryAddress', async () => {
    await truncateDatabase(prisma);

    const { user: client, password: clientPassword } = await createTestUser(
      prisma,
      {
        email: 'cart-missing-address@example.test',
        roles: [Role.CLIENT],
      },
    );
    const { user: provider } = await createTestUser(prisma, {
      email: 'cart-missing-address-provider@example.test',
      roles: [Role.CLIENT, Role.PROVIDER],
      stripeAccountId: 'acct_cart_missing_address_provider',
      latitude: 40.417,
      longitude: -3.704,
      providerServiceRadiusKm: 8,
    });

    const clientToken = (
      await loginAndGetToken(app, client.email, clientPassword)
    ).body.access_token;

    const { city, category } = await createCatalogFixture(
      prisma,
      'cart-missing-address',
      { maxDeliveryRadiusKm: 8 },
    );
    const product = await createProductFixture(
      prisma,
      provider.id,
      city.id,
      category.id,
      'cart-missing-address',
    );

    await request(app.getHttpServer())
      .post('/cart/items')
      .set(authHeader(clientToken))
      .send({ productId: product.id, quantity: 1 })
      .expect(201);

    await request(app.getHttpServer())
      .post('/cart/checkout')
      .set(authHeader(clientToken))
      .set('Idempotency-Key', 'cart-missing-address-key')
      .send({
        cityId: city.id,
        postalCode: '28013',
        discoveryRadiusKm: 6,
      })
      .expect(400);
  });

  it('fails official checkout without postalCode', async () => {
    await truncateDatabase(prisma);

    const { user: client, password: clientPassword } = await createTestUser(
      prisma,
      {
        email: 'cart-missing-postal@example.test',
        roles: [Role.CLIENT],
      },
    );
    const { user: provider } = await createTestUser(prisma, {
      email: 'cart-missing-postal-provider@example.test',
      roles: [Role.CLIENT, Role.PROVIDER],
      stripeAccountId: 'acct_cart_missing_postal_provider',
      latitude: 40.417,
      longitude: -3.704,
      providerServiceRadiusKm: 8,
    });

    const clientToken = (
      await loginAndGetToken(app, client.email, clientPassword)
    ).body.access_token;

    const { city, category } = await createCatalogFixture(
      prisma,
      'cart-missing-postal',
      { maxDeliveryRadiusKm: 8 },
    );
    const product = await createProductFixture(
      prisma,
      provider.id,
      city.id,
      category.id,
      'cart-missing-postal',
    );

    await request(app.getHttpServer())
      .post('/cart/items')
      .set(authHeader(clientToken))
      .send({ productId: product.id, quantity: 1 })
      .expect(201);

    await request(app.getHttpServer())
      .post('/cart/checkout')
      .set(authHeader(clientToken))
      .set('Idempotency-Key', 'cart-missing-postal-key')
      .send({
        cityId: city.id,
        deliveryAddress: 'Calle Mayor 1',
        discoveryRadiusKm: 6,
      })
      .expect(400);
  });

  it('fails official checkout when the address cannot be geocoded', async () => {
    await truncateDatabase(prisma);

    const { user: client, password: clientPassword } = await createTestUser(
      prisma,
      {
        email: 'cart-ungeocodable-client@example.test',
        roles: [Role.CLIENT],
      },
    );
    const { user: provider } = await createTestUser(prisma, {
      email: 'cart-ungeocodable-provider@example.test',
      roles: [Role.CLIENT, Role.PROVIDER],
      stripeAccountId: 'acct_cart_ungeocodable_provider',
      latitude: 40.417,
      longitude: -3.704,
      providerServiceRadiusKm: 8,
    });

    const clientToken = (
      await loginAndGetToken(app, client.email, clientPassword)
    ).body.access_token;

    const { city, category } = await createCatalogFixture(
      prisma,
      'cart-ungeocodable',
      { maxDeliveryRadiusKm: 8 },
    );
    const product = await createProductFixture(
      prisma,
      provider.id,
      city.id,
      category.id,
      'cart-ungeocodable',
    );

    await request(app.getHttpServer())
      .post('/cart/items')
      .set(authHeader(clientToken))
      .send({ productId: product.id, quantity: 1 })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/cart/checkout')
      .set(authHeader(clientToken))
      .set('Idempotency-Key', 'cart-ungeocodable-key')
      .send({
        ...validCheckoutPayload(city.id),
        deliveryAddress: 'UNGEO TEST 999',
      })
      .expect(400);

    expect(response.body.message).toBe(
      'Delivery address could not be geocoded for the selected city',
    );
  });

  it('fails official checkout when any provider falls outside the effective coverage radius', async () => {
    await truncateDatabase(prisma);

    const { user: client, password: clientPassword } = await createTestUser(
      prisma,
      {
        email: 'cart-out-of-range-client@example.test',
        roles: [Role.CLIENT],
      },
    );
    const { user: provider } = await createTestUser(prisma, {
      email: 'cart-out-of-range-provider@example.test',
      roles: [Role.CLIENT, Role.PROVIDER],
      stripeAccountId: 'acct_cart_out_of_range_provider',
      latitude: 40.417,
      longitude: -3.704,
      providerServiceRadiusKm: 4,
    });

    const clientToken = (
      await loginAndGetToken(app, client.email, clientPassword)
    ).body.access_token;

    const { city, category } = await createCatalogFixture(
      prisma,
      'cart-out-of-range',
      { maxDeliveryRadiusKm: 5 },
    );
    const product = await createProductFixture(
      prisma,
      provider.id,
      city.id,
      category.id,
      'cart-out-of-range',
    );

    await request(app.getHttpServer())
      .post('/cart/items')
      .set(authHeader(clientToken))
      .send({ productId: product.id, quantity: 1 })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/cart/checkout')
      .set(authHeader(clientToken))
      .set('Idempotency-Key', 'cart-out-of-range-key')
      .send({
        ...validCheckoutPayload(city.id),
        deliveryAddress: 'FAR TEST 999',
      })
      .expect(400);

    expect(response.body.message).toContain(
      'is outside the delivery coverage area',
    );
  });

  it('creates one root order with one providerOrder per provider when checkout uses a geocoded address within range', async () => {
    await truncateDatabase(prisma);

    const { user: client, password: clientPassword } = await createTestUser(
      prisma,
      {
        email: 'cart-client@example.test',
        roles: [Role.CLIENT],
      },
    );
    const { user: providerA } = await createTestUser(prisma, {
      email: 'cart-provider-a@example.test',
      roles: [Role.CLIENT, Role.PROVIDER],
      stripeAccountId: 'acct_cart_provider_a',
      latitude: 40.417,
      longitude: -3.704,
      providerServiceRadiusKm: 8,
    });
    const { user: providerB } = await createTestUser(prisma, {
      email: 'cart-provider-b@example.test',
      roles: [Role.CLIENT, Role.PROVIDER],
      stripeAccountId: 'acct_cart_provider_b',
      latitude: 40.418,
      longitude: -3.705,
      providerServiceRadiusKm: 8,
    });

    const clientToken = (
      await loginAndGetToken(app, client.email, clientPassword)
    ).body.access_token;

    const { city, category } = await createCatalogFixture(prisma, 'cart-e2e', {
      maxDeliveryRadiusKm: 8,
    });
    const productA = await createProductFixture(
      prisma,
      providerA.id,
      city.id,
      category.id,
      'cart-provider-a',
    );
    const productB = await createProductFixture(
      prisma,
      providerB.id,
      city.id,
      category.id,
      'cart-provider-b',
    );

    await request(app.getHttpServer())
      .post('/cart/items')
      .set(authHeader(clientToken))
      .send({ productId: productA.id, quantity: 1 })
      .expect(201);

    await request(app.getHttpServer())
      .post('/cart/items')
      .set(authHeader(clientToken))
      .send({ productId: productB.id, quantity: 1 })
      .expect(201);

    const checkoutResponse = await request(app.getHttpServer())
      .post('/cart/checkout')
      .set(authHeader(clientToken))
      .set('Idempotency-Key', 'cart-checkout-e2e-key')
      .send(validCheckoutPayload(city.id))
      .expect(201);

    expect(checkoutResponse.body.id).toBeDefined();
    expect(checkoutResponse.body.deliveryAddress).toBe('Calle Mayor 1');
    expect(checkoutResponse.body.postalCode).toBe('28013');
    expect(checkoutResponse.body.deliveryLat).toBeCloseTo(40.4168, 3);
    expect(checkoutResponse.body.deliveryLng).toBeCloseTo(-3.7038, 3);
    expect(checkoutResponse.body.providerOrders).toHaveLength(2);
    expect(
      new Set(
        checkoutResponse.body.providerOrders.map(
          (providerOrder: any) => providerOrder.providerId,
        ),
      ).size,
    ).toBe(2);
    expect(
      checkoutResponse.body.providerOrders.every(
        (providerOrder: any) =>
          Number(providerOrder.deliveryDistanceKm) <=
          Number(providerOrder.coverageLimitKm),
      ),
    ).toBe(true);
  });

  it('returns an aggregated payment contract for provider sessions and runner state', async () => {
    await truncateDatabase(prisma);

    const { user: client, password: clientPassword } = await createTestUser(
      prisma,
      {
        email: 'cart-payments-client@example.test',
        roles: [Role.CLIENT],
      },
    );
    const { user: providerA } = await createTestUser(prisma, {
      email: 'cart-payments-provider-a@example.test',
      roles: [Role.CLIENT, Role.PROVIDER],
      stripeAccountId: 'acct_cart_payments_provider_a',
      latitude: 40.417,
      longitude: -3.704,
      providerServiceRadiusKm: 8,
    });
    const { user: providerB } = await createTestUser(prisma, {
      email: 'cart-payments-provider-b@example.test',
      roles: [Role.CLIENT, Role.PROVIDER],
      stripeAccountId: 'acct_cart_payments_provider_b',
      latitude: 40.418,
      longitude: -3.705,
      providerServiceRadiusKm: 8,
    });
    const { user: runner } = await createTestUser(prisma, {
      email: 'cart-payments-runner@example.test',
      roles: [Role.CLIENT, Role.RUNNER],
      stripeAccountId: 'acct_cart_payments_runner',
      withRunnerProfile: true,
    });

    const clientToken = (
      await loginAndGetToken(app, client.email, clientPassword)
    ).body.access_token;

    const { city, category } = await createCatalogFixture(
      prisma,
      'cart-payments-e2e',
      { maxDeliveryRadiusKm: 8 },
    );
    const productA = await createProductFixture(
      prisma,
      providerA.id,
      city.id,
      category.id,
      'cart-payments-provider-a',
    );
    const productB = await createProductFixture(
      prisma,
      providerB.id,
      city.id,
      category.id,
      'cart-payments-provider-b',
    );

    await request(app.getHttpServer())
      .post('/cart/items')
      .set(authHeader(clientToken))
      .send({ productId: productA.id, quantity: 1 })
      .expect(201);

    await request(app.getHttpServer())
      .post('/cart/items')
      .set(authHeader(clientToken))
      .send({ productId: productB.id, quantity: 1 })
      .expect(201);

    const checkoutResponse = await request(app.getHttpServer())
      .post('/cart/checkout')
      .set(authHeader(clientToken))
      .set('Idempotency-Key', 'cart-payments-contract-key')
      .send(validCheckoutPayload(city.id))
      .expect(201);

    const orderId = checkoutResponse.body.id;
    expect(Number(checkoutResponse.body.deliveryFee)).toBe(5.15);
    expect(Number(checkoutResponse.body.deliveryDistanceKm)).toBe(0.17);
    expect(Number(checkoutResponse.body.runnerBaseFee)).toBe(3.5);
    expect(Number(checkoutResponse.body.runnerPerKmFee)).toBe(0.9);
    expect(Number(checkoutResponse.body.runnerExtraPickupFee)).toBe(1.5);

    await prisma.providerOrder.updateMany({
      where: { orderId },
      data: {
        paymentStatus: ProviderPaymentStatus.PAID,
        status: ProviderOrderStatus.PAID,
      },
    });
    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: DeliveryStatus.CONFIRMED,
      },
    });

    const deliveryOrder = await request(app.getHttpServer())
      .post('/delivery/orders')
      .set(authHeader(clientToken))
      .send({
        orderId,
        deliveryFee: 5.15,
        currency: 'EUR',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/delivery/orders/${deliveryOrder.body.id}/assign-runner`)
      .set(authHeader(clientToken))
      .send({ runnerId: runner.id })
      .expect(201);

    const afterDelivery = await request(app.getHttpServer())
      .post(`/payments/orders/${orderId}/provider-sessions`)
      .set(authHeader(clientToken))
      .send()
      .expect(201);

    expect(afterDelivery.body.paymentMode).toBe('PROVIDER_ORDER_SESSIONS');
    expect(afterDelivery.body.orderStatus).toBe(DeliveryStatus.CONFIRMED);
    expect(afterDelivery.body.providerPaymentStatus).toBe('PAID');
    expect(afterDelivery.body.paidProviderOrders).toBe(2);
    expect(afterDelivery.body.totalProviderOrders).toBe(2);
    expect(
      afterDelivery.body.providerOrders.every(
        (providerOrder: any) => providerOrder.paymentRequired === false,
      ),
    ).toBe(true);
    expect(
      afterDelivery.body.providerOrders.every(
        (providerOrder: any) =>
          typeof providerOrder.providerName === 'string' &&
          providerOrder.providerName.length > 0,
      ),
    ).toBe(true);
    expect(afterDelivery.body.runnerPayment).toEqual({
      paymentMode: 'DELIVERY_ORDER_SESSION',
      deliveryOrderId: deliveryOrder.body.id,
      runnerId: runner.id,
      deliveryStatus: 'RUNNER_ASSIGNED',
      paymentStatus: 'PENDING',
      paymentRequired: true,
      sessionPrepared: false,
      amount: 5.15,
      currency: 'EUR',
      pricingDistanceKm: 0.17,
      pickupCount: 2,
      additionalPickupCount: 1,
      baseFee: 3.5,
      perKmFee: 0.9,
      distanceFee: 0.15,
      extraPickupFee: 1.5,
      extraPickupCharge: 1.5,
    });
  });

  it('applies a provider-owned client discount only to the matching provider across cart and checkout', async () => {
    await truncateDatabase(prisma);

    const { user: client, password: clientPassword } = await createTestUser(
      prisma,
      {
        email: 'provider-discount-client@example.test',
        roles: [Role.CLIENT],
      },
    );
    const { user: providerA, password: providerAPassword } =
      await createTestUser(prisma, {
        email: 'provider-discount-provider-a@example.test',
        roles: [Role.CLIENT, Role.PROVIDER],
        stripeAccountId: 'acct_provider_discount_a',
        latitude: 40.417,
        longitude: -3.704,
        providerServiceRadiusKm: 8,
      });
    const { user: providerB } = await createTestUser(prisma, {
      email: 'provider-discount-provider-b@example.test',
      roles: [Role.CLIENT, Role.PROVIDER],
      stripeAccountId: 'acct_provider_discount_b',
      latitude: 40.418,
      longitude: -3.705,
      providerServiceRadiusKm: 8,
    });

    const clientToken = (
      await loginAndGetToken(app, client.email, clientPassword)
    ).body.access_token;
    const providerAToken = (
      await loginAndGetToken(app, providerA.email, providerAPassword)
    ).body.access_token;

    const { city, category } = await createCatalogFixture(
      prisma,
      'provider-discount',
      { maxDeliveryRadiusKm: 8 },
    );
    const discountedProduct = await createProductFixture(
      prisma,
      providerA.id,
      city.id,
      category.id,
      'provider-discount-a',
    );
    const regularProduct = await createProductFixture(
      prisma,
      providerB.id,
      city.id,
      category.id,
      'provider-discount-b',
    );

    await prisma.product.update({
      where: { id: discountedProduct.id },
      data: {
        price: 12.5,
        discountPrice: null,
      },
    });
    await prisma.product.update({
      where: { id: regularProduct.id },
      data: {
        price: 10,
        discountPrice: null,
      },
    });

    const discountResponse = await request(app.getHttpServer())
      .post(`/products/${discountedProduct.id}/client-discounts`)
      .set(authHeader(providerAToken))
      .send({
        clientId: client.id,
        discountPrice: 9,
        active: true,
      })
      .expect(201);

    expect(discountResponse.body.productId).toBe(discountedProduct.id);
    expect(discountResponse.body.clientId).toBe(client.id);
    expect(discountResponse.body.discountPrice).toBe(9);
    expect(discountResponse.body.active).toBe(true);

    await request(app.getHttpServer())
      .post('/cart/items')
      .set(authHeader(clientToken))
      .send({ productId: discountedProduct.id, quantity: 1 })
      .expect(201);
    await request(app.getHttpServer())
      .post('/cart/items')
      .set(authHeader(clientToken))
      .send({ productId: regularProduct.id, quantity: 1 })
      .expect(201);

    const cartResponse = await request(app.getHttpServer())
      .get('/cart/me')
      .set(authHeader(clientToken))
      .expect(200);

    const discountedProviderGroup = cartResponse.body.providers.find(
      (provider: any) => provider.providerId === providerA.id,
    );
    const regularProviderGroup = cartResponse.body.providers.find(
      (provider: any) => provider.providerId === providerB.id,
    );

    expect(discountedProviderGroup.subtotalAmount).toBe('9');
    expect(discountedProviderGroup.items[0].unitPriceSnapshot).toBe('12.5');
    expect(discountedProviderGroup.items[0].discountPriceSnapshot).toBe('9');
    expect(discountedProviderGroup.items[0].effectiveUnitPriceSnapshot).toBe(
      '9',
    );
    expect(regularProviderGroup.subtotalAmount).toBe('10');
    expect(regularProviderGroup.items[0].discountPriceSnapshot).toBeNull();
    expect(regularProviderGroup.items[0].effectiveUnitPriceSnapshot).toBe('10');

    const checkoutResponse = await request(app.getHttpServer())
      .post('/cart/checkout')
      .set(authHeader(clientToken))
      .set('Idempotency-Key', 'provider-discount-checkout-key')
      .send(validCheckoutPayload(city.id))
      .expect(201);

    const discountedProviderOrder = checkoutResponse.body.providerOrders.find(
      (providerOrder: any) => providerOrder.providerId === providerA.id,
    );
    const regularProviderOrder = checkoutResponse.body.providerOrders.find(
      (providerOrder: any) => providerOrder.providerId === providerB.id,
    );

    expect(Number(discountedProviderOrder.subtotalAmount)).toBe(9);
    expect(Number(regularProviderOrder.subtotalAmount)).toBe(10);

    const persistedOrder = await prisma.order.findUniqueOrThrow({
      where: { id: checkoutResponse.body.id },
      include: {
        providerOrders: {
          include: {
            items: true,
          },
        },
      },
    });

    const persistedDiscountedOrder = persistedOrder.providerOrders.find(
      (providerOrder) => providerOrder.providerId === providerA.id,
    )!;
    const persistedRegularOrder = persistedOrder.providerOrders.find(
      (providerOrder) => providerOrder.providerId === providerB.id,
    )!;

    expect(Number(persistedDiscountedOrder.subtotalAmount)).toBe(9);
    expect(Number(persistedRegularOrder.subtotalAmount)).toBe(10);
    expect(
      Number(persistedDiscountedOrder.items[0].unitBasePriceSnapshot),
    ).toBe(12.5);
    expect(
      Number(persistedDiscountedOrder.items[0].discountPriceSnapshot),
    ).toBe(9);
    expect(Number(persistedDiscountedOrder.items[0].priceAtPurchase)).toBe(9);
    expect(Number(persistedRegularOrder.items[0].unitBasePriceSnapshot)).toBe(
      10,
    );
    expect(persistedRegularOrder.items[0].discountPriceSnapshot).toBeNull();
    expect(Number(persistedRegularOrder.items[0].priceAtPurchase)).toBe(10);
  });
});
