import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { AdminService } from '../admin/admin.service';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEMO_PROVIDER_SEEDS,
  DEMO_RUNNER_SEEDS,
  DEMO_SHARED_PASSWORD,
} from './demo.seed-data';

export type DemoUserSeed = {
  email: string;
  name: string;
  kind: 'ADMIN' | 'PROVIDER' | 'RUNNER' | 'USER';
  citySlug?: string;
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

    for (const { email } of DEMO_PROVIDER_SEEDS) {
      const provider = await this.findUserByEmail(email);
      await this.adminService.grantProvider(provider.id, adminId);
      await this.adminService.revokeRole(provider.id, Role.CLIENT, adminId);
    }

    for (const { email } of DEMO_RUNNER_SEEDS) {
      const runner = await this.findUserByEmail(email);
      await this.adminService.grantRunner(runner.id, adminId);
      await this.adminService.revokeRole(runner.id, Role.CLIENT, adminId);
    }
  }

  async bootstrapDemoPaymentAccounts() {
    for (const providerSeed of DEMO_PROVIDER_SEEDS) {
      const user = await this.findUserByEmail(providerSeed.email);
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          stripeAccountId: providerSeed.paymentAccountId,
          address: providerSeed.address,
          latitude: providerSeed.latitude,
          longitude: providerSeed.longitude,
          providerServiceRadiusKm: providerSeed.providerServiceRadiusKm,
        },
      });
    }

    for (const runnerSeed of DEMO_RUNNER_SEEDS) {
      const user = await this.findUserByEmail(runnerSeed.email);
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          stripeAccountId: runnerSeed.paymentAccountId,
        },
      });

      await this.prisma.runnerProfile.upsert({
        where: { userId: user.id },
        update: {
          baseLat: runnerSeed.baseLat,
          baseLng: runnerSeed.baseLng,
          maxDistanceKm: runnerSeed.maxDistanceKm,
          priceBase: runnerSeed.priceBase,
          pricePerKm: runnerSeed.pricePerKm,
          minFee: runnerSeed.minFee,
          isActive: true,
        },
        create: {
          userId: user.id,
          baseLat: runnerSeed.baseLat,
          baseLng: runnerSeed.baseLng,
          maxDistanceKm: runnerSeed.maxDistanceKm,
          priceBase: runnerSeed.priceBase,
          pricePerKm: runnerSeed.pricePerKm,
          minFee: runnerSeed.minFee,
          isActive: true,
        },
      });
    }
  }
}
