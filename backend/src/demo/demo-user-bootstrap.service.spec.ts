import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { AdminService } from '../admin/admin.service';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { DemoUserBootstrapService } from './demo-user-bootstrap.service';
import { DEMO_PROVIDER_SEEDS, DEMO_RUNNER_SEEDS } from './demo.seed-data';

describe('DemoUserBootstrapService', () => {
  let service: DemoUserBootstrapService;
  let configService: { get: jest.Mock };
  let prismaMock: {
    user: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    runnerProfile: {
      upsert: jest.Mock;
    };
  };
  let authService: {
    register: jest.Mock;
    verifyEmail: jest.Mock;
  };
  let adminService: {
    grantRole: jest.Mock;
    revokeRole: jest.Mock;
    grantProvider: jest.Mock;
    grantRunner: jest.Mock;
  };

  beforeEach(async () => {
    configService = {
      get: jest.fn(),
    };
    prismaMock = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      runnerProfile: {
        upsert: jest.fn(),
      },
    };
    authService = {
      register: jest.fn(),
      verifyEmail: jest.fn(),
    };
    adminService = {
      grantRole: jest.fn(),
      revokeRole: jest.fn(),
      grantProvider: jest.fn(),
      grantRunner: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DemoUserBootstrapService,
        { provide: ConfigService, useValue: configService },
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuthService, useValue: authService },
        { provide: AdminService, useValue: adminService },
      ],
    }).compile();

    service = module.get(DemoUserBootstrapService);
  });

  it('returns existing demo admin when already present', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'admin-1' });

    const result = await service.ensureDemoAdmin({
      email: 'admin.demo@local.test',
      name: 'Admin Demo',
      kind: 'ADMIN',
    });

    expect(result).toEqual({ id: 'admin-1' });
    expect(authService.register).not.toHaveBeenCalled();
  });

  it('returns the fixed shared demo password', () => {
    configService.get.mockReturnValue(undefined);

    expect(service.getDemoPassword()).toBe('DemoPass123!');
  });

  it('registers and verifies a demo user', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce({
        id: 'user-1',
        email: 'user.demo@local.test',
        name: 'User Demo',
        roles: [Role.CLIENT],
        verificationToken: 'verify-1',
        stripeAccountId: null,
      })
      .mockResolvedValueOnce({
        id: 'user-1',
        email: 'user.demo@local.test',
        name: 'User Demo',
        roles: [Role.CLIENT],
        verificationToken: null,
        stripeAccountId: null,
      });

    const result = await service.registerAndVerifyUser({
      email: 'user.demo@local.test',
      name: 'User Demo',
      kind: 'USER',
    });

    expect(authService.register).toHaveBeenCalled();
    expect(authService.verifyEmail).toHaveBeenCalledWith('verify-1');
    expect(result.id).toBe('user-1');
  });

  it('throws when a demo user lookup does not exist', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(service.findUserByEmail('missing@local.test')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('bootstraps demo payment accounts and provider coordinates', async () => {
    const users = new Map(
      [...DEMO_PROVIDER_SEEDS, ...DEMO_RUNNER_SEEDS].map((seed, index) => [
        seed.email,
        {
          id: `user-${index + 1}`,
          email: seed.email,
          name: seed.name,
          roles: [
            DEMO_PROVIDER_SEEDS.some(
              (provider) => provider.email === seed.email,
            )
              ? Role.PROVIDER
              : Role.RUNNER,
          ],
          verificationToken: null,
          stripeAccountId: null,
        },
      ]),
    );
    prismaMock.user.findUnique.mockImplementation(({ where: { email } }) =>
      Promise.resolve(users.get(email) ?? null),
    );

    await service.bootstrapDemoPaymentAccounts();

    expect(prismaMock.user.update).toHaveBeenCalledTimes(
      DEMO_PROVIDER_SEEDS.length + DEMO_RUNNER_SEEDS.length,
    );
    expect(prismaMock.runnerProfile.upsert).toHaveBeenCalledTimes(
      DEMO_RUNNER_SEEDS.length,
    );
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          stripeAccountId: DEMO_PROVIDER_SEEDS[0]?.paymentAccountId,
          providerServiceRadiusKm: 8,
        }),
      }),
    );
  });
});
