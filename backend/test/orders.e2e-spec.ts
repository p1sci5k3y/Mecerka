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

  it('completes the legacy single-provider order lifecycle and marks the endpoint as deprecated', async () => {
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

    await request(app.getHttpServer())
      .post('/users/pin')
      .set(authHeader(clientToken))
      .send({ pin: '123456' })
      .expect(201);

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

    const createResponse = await request(app.getHttpServer())
      .post('/orders')
      .set(authHeader(clientToken))
      .send({
        pin: '123456',
        deliveryAddress: '123 E2E Street',
        items: [{ productId, quantity: 2 }],
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.headers.deprecation).toBe('true');
    expect(createResponse.headers.warning).toContain(
      'Legacy single-provider order creation endpoint',
    );
    expect(createResponse.body.id).toBeDefined();
    expect(createResponse.body.status).toBe(DeliveryStatus.PENDING);
    createdOrderId = createResponse.body.id;

    await prisma.order.update({
      where: { id: createdOrderId },
      data: { status: DeliveryStatus.CONFIRMED },
    });
    const orderWithPO = await prisma.order.findUnique({
      where: { id: createdOrderId },
      include: { providerOrders: true },
    });
    providerOrderId = orderWithPO!.providerOrders[0].id;

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
