import { INestApplication } from '@nestjs/common';
import { Role, RoleRequestStatus } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  authHeader,
  closeTestApp,
  createTestApp,
  createTestUser,
  loginAndGetToken,
  requestRole,
  truncateDatabase,
} from './helpers/e2e-test-helpers';

describe('Privacy and Response Shape (e2e)', () => {
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

  it('does not expose fiscal fields in /auth/login', async () => {
    const { user, password } = await createTestUser(prisma, {
      email: 'privacy-login@example.test',
      roles: [Role.CLIENT, Role.PROVIDER],
      requestedRole: Role.PROVIDER,
      roleStatus: RoleRequestStatus.APPROVED,
      requestedAt: new Date(),
      fiscalIdHash:
        '7ad3c3a0af0e7c7dd96d4177dd0f3f0b4f0e05cbb4f2bd77f045c7e8ab2a89f8',
      fiscalIdLast4: '5678',
      fiscalCountry: 'ES',
    });

    const response = await loginAndGetToken(app, user.email, password);

    expect(response.status).toBe(201);
    expect(response.body).not.toHaveProperty('fiscalId');
    expect(response.body).not.toHaveProperty('fiscalIdHash');
    expect(response.body).not.toHaveProperty('fiscalCountry');
    expect(response.body.user).not.toHaveProperty('fiscalIdHash');
    expect(response.body.user).not.toHaveProperty('fiscalCountry');
    expect(response.body.user).not.toHaveProperty('password');
    expect(response.body.user).not.toHaveProperty('tokenVersion');
  });

  it('does not expose fiscal fields in /auth/me', async () => {
    const { user, password } = await createTestUser(prisma, {
      email: 'privacy-me@example.test',
      roles: [Role.CLIENT, Role.PROVIDER],
      requestedRole: Role.PROVIDER,
      roleStatus: RoleRequestStatus.APPROVED,
      requestedAt: new Date(),
      fiscalIdHash:
        '7ad3c3a0af0e7c7dd96d4177dd0f3f0b4f0e05cbb4f2bd77f045c7e8ab2a89f8',
      fiscalIdLast4: '5678',
      fiscalCountry: 'ES',
    });

    const login = await loginAndGetToken(app, user.email, password);
    const response = await request(app.getHttpServer())
      .get('/auth/me')
      .set(authHeader(login.body.access_token));

    expect(response.status).toBe(200);
    expect(response.body).not.toHaveProperty('fiscalId');
    expect(response.body).not.toHaveProperty('fiscalIdHash');
    expect(response.body).not.toHaveProperty('fiscalCountry');
    expect(response.body).not.toHaveProperty('requestedRole');
    expect(response.body).not.toHaveProperty('roleStatus');
    expect(response.body).not.toHaveProperty('password');
  });

  it('does not expose fiscal fields in /users/request-role responses', async () => {
    const { user, password } = await createTestUser(prisma, {
      email: 'privacy-request-role@example.test',
    });
    const login = await loginAndGetToken(app, user.email, password);

    const response = await requestRole(app, login.body.access_token, {
      role: 'PROVIDER',
      country: 'ES',
      fiscalId: '12345678Z',
    });

    expect([200, 201]).toContain(response.status);
    expect(response.body).not.toHaveProperty('fiscalId');
    expect(response.body).not.toHaveProperty('fiscalIdHash');
    expect(response.body).not.toHaveProperty('fiscalIdLast4');
    expect(response.body).not.toHaveProperty('fiscalCountry');
    expect(response.body).not.toHaveProperty('password');
  });

  it('does not expose fiscal fields in /admin/users', async () => {
    const { user: admin, password: adminPassword } = await createTestUser(
      prisma,
      {
        email: 'privacy-admin@example.test',
        roles: [Role.ADMIN],
      },
    );
    await createTestUser(prisma, {
      email: 'privacy-listed@example.test',
      roles: [Role.CLIENT, Role.PROVIDER],
      requestedRole: Role.PROVIDER,
      roleStatus: RoleRequestStatus.APPROVED,
      requestedAt: new Date(),
      fiscalIdHash:
        '7ad3c3a0af0e7c7dd96d4177dd0f3f0b4f0e05cbb4f2bd77f045c7e8ab2a89f8',
      fiscalIdLast4: '5678',
      fiscalCountry: 'ES',
    });

    const adminLogin = await loginAndGetToken(app, admin.email, adminPassword);
    const response = await request(app.getHttpServer())
      .get('/admin/users')
      .set(authHeader(adminLogin.body.access_token));

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.any(Array));
    expect(response.body[0]).not.toHaveProperty('fiscalId');
    expect(response.body[0]).not.toHaveProperty('fiscalIdHash');
    expect(response.body[0]).not.toHaveProperty('fiscalCountry');
    expect(response.body[0]).not.toHaveProperty('password');
    expect(response.body[0]).not.toHaveProperty('requestedRole');
    expect(response.body[0]).not.toHaveProperty('roleStatus');
  });
});
