import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { AdminService } from '../admin/admin.service';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { DEMO_SHARED_PASSWORD } from './demo.seed-data';

export type DemoUserSeed = {
  email: string;
  name: string;
  kind: 'ADMIN' | 'PROVIDER' | 'RUNNER' | 'USER';
};

@Injectable()
export class DemoUserBootstrapService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly adminService: AdminService,
  ) {}

  async ensureDemoAdmin(adminSeed: DemoUserSeed) {
    const existingAdmin = await this.prisma.user.findUnique({
      where: { email: adminSeed.email },
      select: { id: true },
    });

    if (existingAdmin) {
      return existingAdmin;
    }

    return this.registerAndVerifyUser(adminSeed);
  }

  async findUserByEmail(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        roles: true,
        verificationToken: true,
        stripeAccountId: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`Demo user ${email} was not created`);
    }

    return user;
  }

  getDemoPassword() {
    return DEMO_SHARED_PASSWORD;
  }

  async registerAndVerifyUser(seed: DemoUserSeed) {
    await this.authService.register({
      email: seed.email,
      password: this.getDemoPassword(),
      name: seed.name,
    });

    const created = await this.findUserByEmail(seed.email);
    if (created.verificationToken) {
      await this.authService.verifyEmail(created.verificationToken);
    }

    return this.findUserByEmail(seed.email);
  }

  async applyRoleShape(adminId: string) {
    const admin = await this.findUserByEmail('admin.demo@local.test');
    await this.adminService.grantRole(admin.id, Role.ADMIN, adminId);
    await this.adminService.revokeRole(admin.id, Role.CLIENT, adminId);

    for (const email of [
      'provider.demo@local.test',
      'provider2.demo@local.test',
    ]) {
      const provider = await this.findUserByEmail(email);
      await this.adminService.grantProvider(provider.id, adminId);
      await this.adminService.revokeRole(provider.id, Role.CLIENT, adminId);
    }

    for (const email of ['runner.demo@local.test', 'runner2.demo@local.test']) {
      const runner = await this.findUserByEmail(email);
      await this.adminService.grantRunner(runner.id, adminId);
      await this.adminService.revokeRole(runner.id, Role.CLIENT, adminId);
    }
  }

  async bootstrapDemoPaymentAccounts() {
    const accountIds = new Map<string, string>([
      ['provider.demo@local.test', 'acct_demo_provider_1'],
      ['provider2.demo@local.test', 'acct_demo_provider_2'],
      ['runner.demo@local.test', 'acct_demo_runner_1'],
      ['runner2.demo@local.test', 'acct_demo_runner_2'],
    ]);

    for (const [email, accountId] of accountIds.entries()) {
      const user = await this.findUserByEmail(email);
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          stripeAccountId: accountId,
          ...(email === 'provider.demo@local.test'
            ? {
                address: 'Plaza de Zocodover, 1, Toledo',
                latitude: 39.8569,
                longitude: -4.0245,
                providerServiceRadiusKm: 8,
              }
            : {}),
          ...(email === 'provider2.demo@local.test'
            ? {
                address: 'Calle Comercio, 4, Toledo',
                latitude: 39.8586,
                longitude: -4.0226,
                providerServiceRadiusKm: 8,
              }
            : {}),
        },
      });
    }
  }
}
