import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { Role, DeliveryStatus, ProviderOrderStatus } from '@prisma/client';
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

describe('Order Lifecycle (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let clientToken: string;
  let providerToken: string;
  let runnerToken: string;

  let providerId: string;
  let cityId: string;
  let productId: string;

  let createdOrderId: string;
  let providerOrderId: string;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    prisma = testApp.prisma;
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  it('completes the single-provider order lifecycle', async () => {
    await truncateDatabase(prisma);

    const { user: client, password: clientPassword } = await createTestUser(
      prisma,
      {
        email: 'orders-client@example.test',
        roles: [Role.CLIENT],
      },
    );
    const { user: provider, password: providerPassword } = await createTestUser(
      prisma,
      {
        email: 'orders-provider@example.test',
        roles: [Role.CLIENT, Role.PROVIDER],
        stripeAccountId: 'acct_provider_orders',
      },
    );
    const { user: runner, password: runnerPassword } = await createTestUser(
      prisma,
      {
        email: 'orders-runner@example.test',
        roles: [Role.CLIENT, Role.RUNNER],
        stripeAccountId: 'acct_runner_orders',
        withRunnerProfile: true,
      },
    );

    providerId = provider.id;

    clientToken = (await loginAndGetToken(app, client.email, clientPassword))
      .body.access_token;
    providerToken = (
      await loginAndGetToken(app, provider.email, providerPassword)
    ).body.access_token;
    runnerToken = (await loginAndGetToken(app, runner.email, runnerPassword))
      .body.access_token;

    const { city, category } = await createCatalogFixture(prisma, 'orders-e2e');
    cityId = city.id;
    const product = await createProductFixture(
      prisma,
      provider.id,
      city.id,
      category.id,
      'orders-e2e-product',
    );

    productId = product.id;

    const createdOrder = await prisma.order.create({
      data: {
        totalPrice: 20.0,
        checkoutIdempotencyKey: 'orders-e2e-idempotency-key',
        deliveryAddress: '123 E2E Street',
        status: DeliveryStatus.CONFIRMED,
        clientId: client.id,
        cityId,
        providerOrders: {
          create: {
            providerId,
            subtotalAmount: 20.0,
            items: {
              create: {
                productId,
                quantity: 2,
                priceAtPurchase: 10.0,
              },
            },
          },
        },
      },
      include: { providerOrders: true },
    });

    createdOrderId = createdOrder.id;
    providerOrderId = createdOrder.providerOrders[0].id;

    const providerView = await request(app.getHttpServer())
      .get(`/orders/${createdOrderId}`)
      .set(authHeader(providerToken));

    expect(providerView.status).toBe(200);
    expect(providerView.body.id).toBe(createdOrderId);

    const acceptProviderOrder = await request(app.getHttpServer())
      .patch(`/orders/provider-order/${providerOrderId}/status`)
      .set(authHeader(providerToken))
      .send({ status: ProviderOrderStatus.ACCEPTED });

    expect(acceptProviderOrder.status).toBe(200);

    await request(app.getHttpServer())
      .patch(`/orders/provider-order/${providerOrderId}/status`)
      .set(authHeader(providerToken))
      .send({ status: ProviderOrderStatus.PREPARING });
    await request(app.getHttpServer())
      .patch(`/orders/provider-order/${providerOrderId}/status`)
      .set(authHeader(providerToken))
      .send({ status: ProviderOrderStatus.READY_FOR_PICKUP });

    await prisma.order.update({
      where: { id: createdOrderId },
      data: { status: DeliveryStatus.READY_FOR_ASSIGNMENT },
    });

    const acceptOrder = await request(app.getHttpServer())
      .patch(`/orders/${createdOrderId}/accept`)
      .set(authHeader(runnerToken));

    expect(acceptOrder.status).toBe(200);
    expect(acceptOrder.body.status).toBe(DeliveryStatus.ASSIGNED);

    await request(app.getHttpServer())
      .patch(`/orders/provider-order/${providerOrderId}/status`)
      .set(authHeader(runnerToken))
      .send({ status: ProviderOrderStatus.PICKED_UP });

    await request(app.getHttpServer())
      .patch(`/orders/${createdOrderId}/in-transit`)
      .set(authHeader(runnerToken));

    const completeOrder = await request(app.getHttpServer())
      .patch(`/orders/${createdOrderId}/complete`)
      .set(authHeader(runnerToken));

    expect(completeOrder.status).toBe(200);
    expect(completeOrder.body.status).toBe(DeliveryStatus.DELIVERED);
  });
});
