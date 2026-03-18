import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  TEST_PASSWORD,
  closeTestApp,
  createTestApp,
  truncateDatabase,
} from './helpers/e2e-test-helpers';

describe('Auth and Registration Security (e2e)', () => {
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

  it('rejects mass-assignment payloads on POST /auth/register', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'mass-assignment@example.test',
        password: TEST_PASSWORD,
        name: 'Mass Assignment',
        role: Role.ADMIN,
        roles: [Role.ADMIN],
        requestedRole: Role.PROVIDER,
        roleStatus: 'APPROVED',
        fiscalId: '12345678Z',
        fiscalCountry: 'ES',
        providerProfile: {
          create: {
            slug: 'evil-provider',
          },
        },
      });

    expect(response.status).toBe(400);
  });

  it('registers a plain CLIENT only and does not persist fiscal fields', async () => {
    const email = 'client-register@example.test';

    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password: TEST_PASSWORD,
        name: 'Registered Client',
      });

    expect(response.status).toBe(201);

    const user = await prisma.user.findUniqueOrThrow({
      where: { email },
    });

    expect(user.roles).toEqual([Role.CLIENT]);
    expect(user.requestedRole).toBeNull();
    expect(user.roleStatus).toBeNull();
    expect(user.fiscalIdHash).toBeNull();
    expect(user.fiscalIdLast4).toBeNull();
    expect(user.fiscalCountry).toBeNull();
  });
});
