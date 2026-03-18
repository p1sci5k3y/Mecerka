import { INestApplication } from '@nestjs/common';
import { Role, RoleGrantSource, RoleRequestStatus } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  authHeader,
  closeTestApp,
  createCatalogFixture,
  createOrderFixture,
  createProductFixture,
  createTestApp,
  createTestUser,
  loginAndGetToken,
  truncateDatabase,
} from './helpers/e2e-test-helpers';

describe('Admin and Authorization Boundaries (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    prisma = testApp.prisma;
  });

  beforeEach(async () => {
    await truncateDatabase(prisma);
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  it('forbids a client from accessing admin endpoints', async () => {
    const { user, password } = await createTestUser(prisma, {
      email: 'client-admin-forbidden@example.test',
    });
    const login = await loginAndGetToken(app, user.email, password);

    const response = await request(app.getHttpServer())
      .get('/admin/users')
      .set(authHeader(login.body.access_token));

    expect(response.status).toBe(403);
  });

  it('generic and specialized runner grants produce the same valid domain state', async () => {
    const { user: admin, password: adminPassword } = await createTestUser(
      prisma,
      {
        email: 'admin-grants@example.test',
        roles: [Role.ADMIN],
      },
    );
    const { user: genericRunner } = await createTestUser(prisma, {
      email: 'generic-runner@example.test',
      roles: [Role.CLIENT],
    });
    const { user: specializedRunner } = await createTestUser(prisma, {
      email: 'specialized-runner@example.test',
      roles: [Role.CLIENT],
    });

    const adminLogin = await loginAndGetToken(app, admin.email, adminPassword);

    const genericResponse = await request(app.getHttpServer())
      .post(`/admin/users/${genericRunner.id}/grant`)
      .set(authHeader(adminLogin.body.access_token))
      .send({ role: Role.RUNNER });

    const specializedResponse = await request(app.getHttpServer())
      .post(`/admin/users/${specializedRunner.id}/grant/runner`)
      .set(authHeader(adminLogin.body.access_token))
      .send();

    expect(genericResponse.status).toBe(201);
    expect(specializedResponse.status).toBe(201);

    const [genericStored, specializedStored] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: genericRunner.id },
        include: { runnerProfile: true },
      }),
      prisma.user.findUniqueOrThrow({
        where: { id: specializedRunner.id },
        include: { runnerProfile: true },
      }),
    ]);

    for (const candidate of [genericStored, specializedStored]) {
      expect(candidate.roles).toContain(Role.RUNNER);
      expect(candidate.requestedRole).toBe(Role.RUNNER);
      expect(candidate.roleStatus).toBe(RoleRequestStatus.APPROVED);
      expect(candidate.requestedAt).not.toBeNull();
      expect(candidate.lastRoleSource).toBe(RoleGrantSource.ADMIN);
      expect(candidate.runnerProfile).not.toBeNull();
    }

    expect(genericStored.lastRoleGrantedById).toBe(admin.id);
    expect(specializedStored.lastRoleGrantedById).toBe(admin.id);
  });

  it('forbids a provider from modifying another provider product', async () => {
    const { city, category } = await createCatalogFixture(
      prisma,
      'provider-authz',
    );
    const { user: providerA, password: passwordA } = await createTestUser(
      prisma,
      {
        email: 'provider-a@example.test',
        roles: [Role.CLIENT, Role.PROVIDER],
        stripeAccountId: 'acct_provider_a',
      },
    );
    const { user: providerB } = await createTestUser(prisma, {
      email: 'provider-b@example.test',
      roles: [Role.CLIENT, Role.PROVIDER],
      stripeAccountId: 'acct_provider_b',
    });

    const foreignProduct = await createProductFixture(
      prisma,
      providerB.id,
      city.id,
      category.id,
      'foreign-product',
    );

    const providerALogin = await loginAndGetToken(
      app,
      providerA.email,
      passwordA,
    );
    const response = await request(app.getHttpServer())
      .patch(`/products/${foreignProduct.id}`)
      .set(authHeader(providerALogin.body.access_token))
      .send({ name: 'Hijacked product' });

    expect(response.status).toBe(403);
  });

  it('forbids a user from accessing another user order', async () => {
    const { city } = await createCatalogFixture(prisma, 'order-authz');
    const { user: owner } = await createTestUser(prisma, {
      email: 'order-owner@example.test',
    });
    const { user: intruder, password: intruderPassword } = await createTestUser(
      prisma,
      {
        email: 'order-intruder@example.test',
      },
    );

    const { order } = await createOrderFixture(prisma, {
      clientId: owner.id,
      cityId: city.id,
    });

    const intruderLogin = await loginAndGetToken(
      app,
      intruder.email,
      intruderPassword,
    );
    const response = await request(app.getHttpServer())
      .get(`/orders/${order.id}`)
      .set(authHeader(intruderLogin.body.access_token));

    expect(response.status).toBe(403);
  });
});
