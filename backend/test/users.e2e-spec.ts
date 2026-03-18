import { INestApplication } from '@nestjs/common';
import {
  DeliveryStatus,
  Role,
  RoleGrantSource,
  RoleRequestStatus,
} from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  authHeader,
  closeTestApp,
  createCatalogFixture,
  createOrderFixture,
  createTestApp,
  createTestUser,
  loginAndGetToken,
  requestRole,
  truncateDatabase,
} from './helpers/e2e-test-helpers';

describe('Users Role Request Flow (e2e)', () => {
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

  it('rejects unauthenticated role requests', async () => {
    const response = await request(app.getHttpServer())
      .post('/users/request-role')
      .send({
        role: 'PROVIDER',
        country: 'ES',
        fiscalId: '12345678Z',
      });

    expect(response.status).toBe(401);
  });

  it('rejects role requests when MFA is not completed', async () => {
    const { user, password } = await createTestUser(prisma, {
      email: 'mfa-user@example.test',
      mfaEnabled: true,
    });
    const login = await loginAndGetToken(app, user.email, password);

    expect(login.status).toBe(201);
    expect(login.body.mfaRequired).toBe(true);

    const response = await requestRole(app, login.body.access_token, {
      role: 'PROVIDER',
      country: 'ES',
      fiscalId: '12345678Z',
    });

    expect(response.status).toBe(403);
  });

  it('accepts a valid PROVIDER request, normalizes country, and stores only hash metadata', async () => {
    const { user, password } = await createTestUser(prisma, {
      email: 'provider-request@example.test',
    });
    const login = await loginAndGetToken(app, user.email, password);

    const response = await requestRole(app, login.body.access_token, {
      role: 'PROVIDER',
      country: 'es',
      fiscalId: '12345678Z',
    });

    expect([200, 201]).toContain(response.status);
    expect(response.body.roles).toContain(Role.PROVIDER);
    expect(response.body.requestedRole).toBe(Role.PROVIDER);
    expect(response.body.roleStatus).toBe(RoleRequestStatus.APPROVED);
    expect(response.body).not.toHaveProperty('fiscalId');
    expect(response.body).not.toHaveProperty('fiscalIdHash');
    expect(response.body).not.toHaveProperty('fiscalCountry');

    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        roles: true,
        requestedRole: true,
        roleStatus: true,
        fiscalIdHash: true,
        fiscalIdLast4: true,
        fiscalCountry: true,
        lastRoleGrantedById: true,
        lastRoleSource: true,
      },
    });

    expect(stored.roles).toContain(Role.PROVIDER);
    expect(stored.requestedRole).toBe(Role.PROVIDER);
    expect(stored.roleStatus).toBe(RoleRequestStatus.APPROVED);
    expect(stored.fiscalIdHash).toHaveLength(64);
    expect(stored.fiscalIdHash).not.toBe('12345678Z');
    expect(stored.fiscalIdLast4).toBe('5678Z'.slice(-4));
    expect(stored.fiscalCountry).toBe('ES');
    expect(stored.lastRoleGrantedById).toBeNull();
    expect(stored.lastRoleSource).toBe(RoleGrantSource.SELF_SERVICE);
  });

  it('creates runnerProfile and allows the runner to accept an eligible order', async () => {
    const { user, password } = await createTestUser(prisma, {
      email: 'runner-request@example.test',
    });
    const login = await loginAndGetToken(app, user.email, password);

    const roleResponse = await requestRole(app, login.body.access_token, {
      role: 'RUNNER',
      country: 'ES',
      fiscalId: '12345678Z',
    });

    expect([200, 201]).toContain(roleResponse.status);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        stripeAccountId: 'acct_runner_e2e',
      },
    });

    const runnerAfterRequest = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        runnerProfile: true,
      },
    });

    expect(runnerAfterRequest.runnerProfile).not.toBeNull();

    const { city } = await createCatalogFixture(prisma, 'runner-role');
    const { user: client } = await createTestUser(prisma, {
      email: 'runner-target-client@example.test',
    });
    const { order } = await createOrderFixture(prisma, {
      clientId: client.id,
      cityId: city.id,
      status: DeliveryStatus.READY_FOR_ASSIGNMENT,
    });

    const runnerLogin = await loginAndGetToken(app, user.email, password);
    const acceptResponse = await request(app.getHttpServer())
      .patch(`/orders/${order.id}/accept`)
      .set(authHeader(runnerLogin.body.access_token));

    expect(acceptResponse.status).toBe(200);
    expect(acceptResponse.body.runnerId).toBe(user.id);
    expect(acceptResponse.body.status).toBe(DeliveryStatus.ASSIGNED);
  });

  it('rejects extra fields on the role request payload', async () => {
    const { user, password } = await createTestUser(prisma);
    const login = await loginAndGetToken(app, user.email, password);

    const response = await requestRole(app, login.body.access_token, {
      role: 'PROVIDER',
      country: 'ES',
      fiscalId: '12345678Z',
      roleStatus: 'APPROVED',
      requestedAt: new Date().toISOString(),
      roles: [Role.ADMIN],
      nested: {
        update: {
          roles: [Role.ADMIN],
        },
      },
    });

    expect(response.status).toBe(400);
  });

  it('rejects ADMIN as a requestable role at validation level', async () => {
    const { user, password } = await createTestUser(prisma);
    const login = await loginAndGetToken(app, user.email, password);

    const response = await requestRole(app, login.body.access_token, {
      role: 'ADMIN',
      country: 'ES',
      fiscalId: '12345678Z',
    });

    expect(response.status).toBe(400);
  });

  it('enforces the privileged role request cooldown', async () => {
    const { user, password } = await createTestUser(prisma);
    const login = await loginAndGetToken(app, user.email, password);

    const firstResponse = await requestRole(app, login.body.access_token, {
      role: 'PROVIDER',
      country: 'ES',
      fiscalId: '12345678Z',
    });

    expect([200, 201]).toContain(firstResponse.status);

    const secondResponse = await requestRole(app, login.body.access_token, {
      role: 'RUNNER',
      country: 'ES',
      fiscalId: '12345678Z',
    });

    expect(secondResponse.status).toBe(409);
    expect(String(secondResponse.body.message)).toContain('Please wait');
  });

  it.each([
    [
      'unsupported country',
      { role: 'RUNNER', country: 'FR', fiscalId: '12345678Z' },
    ],
    ['null fiscalId', { role: 'RUNNER', country: 'ES', fiscalId: null }],
    ['array fiscalId', { role: 'RUNNER', country: 'ES', fiscalId: [] }],
    ['object fiscalId', { role: 'RUNNER', country: 'ES', fiscalId: {} }],
    ['array role', { role: ['RUNNER'], country: 'ES', fiscalId: '12345678Z' }],
    [
      'array country',
      { role: 'RUNNER', country: ['ES'], fiscalId: '12345678Z' },
    ],
    [
      'invalid fiscalId',
      { role: 'RUNNER', country: 'ES', fiscalId: 'INVALID' },
    ],
  ])('rejects malformed validation input: %s', async (_label, payload) => {
    const { user, password } = await createTestUser(prisma);
    const login = await loginAndGetToken(app, user.email, password);

    const response = await requestRole(
      app,
      login.body.access_token,
      payload as Record<string, unknown>,
    );

    expect(response.status).toBe(400);
  });
});
