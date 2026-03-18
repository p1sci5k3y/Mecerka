import { INestApplication } from '@nestjs/common';
import { Role, RoleRequestStatus } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  closeTestApp,
  createTestApp,
  createTestUser,
  loginAndGetToken,
  requestRole,
  truncateDatabase,
} from './helpers/e2e-test-helpers';

describe('Role Request Concurrency (e2e)', () => {
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

  it('handles duplicate concurrent RUNNER requests without duplicate roles or partial state', async () => {
    const { user, password } = await createTestUser(prisma, {
      email: 'concurrency-runner@example.test',
    });
    const login = await loginAndGetToken(app, user.email, password);

    const [first, second] = await Promise.all([
      requestRole(app, login.body.access_token, {
        role: 'RUNNER',
        country: 'ES',
        fiscalId: '12345678Z',
      }),
      requestRole(app, login.body.access_token, {
        role: 'RUNNER',
        country: 'ES',
        fiscalId: '12345678Z',
      }),
    ]);

    expect([first.status, second.status].sort()).toEqual([201, 409]);

    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { runnerProfile: true },
    });

    expect(new Set(stored.roles).size).toBe(stored.roles.length);
    expect(stored.roles).toContain(Role.RUNNER);
    expect(stored.requestedRole).toBe(Role.RUNNER);
    expect(stored.roleStatus).toBe(RoleRequestStatus.APPROVED);
    expect(stored.requestedAt).not.toBeNull();
    expect(stored.runnerProfile).not.toBeNull();
  });

  it('serializes concurrent PROVIDER and RUNNER requests into a single consistent outcome', async () => {
    const { user, password } = await createTestUser(prisma, {
      email: 'concurrency-mixed@example.test',
    });
    const login = await loginAndGetToken(app, user.email, password);

    const [providerResponse, runnerResponse] = await Promise.all([
      requestRole(app, login.body.access_token, {
        role: 'PROVIDER',
        country: 'ES',
        fiscalId: '12345678Z',
      }),
      requestRole(app, login.body.access_token, {
        role: 'RUNNER',
        country: 'ES',
        fiscalId: '12345678Z',
      }),
    ]);

    expect([providerResponse.status, runnerResponse.status].sort()).toEqual([
      201, 409,
    ]);

    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { runnerProfile: true },
    });

    expect(new Set(stored.roles).size).toBe(stored.roles.length);
    expect(stored.roles).toContain(Role.CLIENT);
    expect(
      stored.roles.filter(
        (role: Role) => role === Role.PROVIDER || role === Role.RUNNER,
      ),
    ).toHaveLength(1);
    expect([Role.PROVIDER, Role.RUNNER]).toContain(
      stored.requestedRole as Role,
    );
    expect(stored.roleStatus).toBe(RoleRequestStatus.APPROVED);
    expect(stored.requestedAt).not.toBeNull();

    if (stored.requestedRole === Role.RUNNER) {
      expect(stored.runnerProfile).not.toBeNull();
    } else {
      expect(stored.runnerProfile).toBeNull();
    }
  });
});
