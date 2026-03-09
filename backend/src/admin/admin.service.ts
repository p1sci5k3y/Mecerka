import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) { }

  // --- User Management ---
  async getAllUsers() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        roles: true,
        createdAt: true,
        mfaEnabled: true,
        active: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async grantRole(id: string, role: Role, currentAdminId: string) {
    if (id === currentAdminId && role === Role.ADMIN) {
      // It's technically safe to grant admin to yourself if you already are, but we'll allow it or skip.
      // The real danger is removing your own admin role.
    }

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id } });
      if (!user) throw new BadRequestException('User not found');

      const rolesSet = new Set(user.roles);
      if (rolesSet.has(role)) {
        return user; // Already has role
      }

      rolesSet.add(role);

      // If expanding logic later: Create Provider Profile
      // For now, we just add the role.

      return tx.user.update({
        where: { id },
        data: { roles: Array.from(rolesSet) },
        select: { id: true, roles: true },
      });
    });
  }

  async revokeRole(id: string, role: Role, currentAdminId: string) {
    if (id === currentAdminId && role === Role.ADMIN) {
      throw new ForbiddenException('Cannot revoke your own ADMIN role');
    }

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id } });
      if (!user) throw new BadRequestException('User not found');

      const rolesSet = new Set(user.roles);
      if (!rolesSet.has(role)) {
        return user; // Doesn't have role
      }

      rolesSet.delete(role);

      if (rolesSet.size === 0) {
        throw new BadRequestException('User must have at least one role');
      }

      return tx.user.update({
        where: { id },
        data: { roles: Array.from(rolesSet) },
        select: { id: true, roles: true },
      });
    });
  }

  async activateUser(id: string, currentAdminId: string) {
    if (id === currentAdminId) {
      throw new ForbiddenException('Cannot activate yourself');
    }
    return this.prisma.user.update({
      where: { id },
      data: { active: true },
      select: { id: true, active: true },
    });
  }

  async blockUser(id: string, currentAdminId: string) {
    if (id === currentAdminId) {
      throw new ForbiddenException('Cannot block yourself');
    }
    return this.prisma.user.update({
      where: { id },
      data: { active: false },
      select: { id: true, active: true },
    });
  }

  async grantProvider(userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new BadRequestException('User not found');
      if (user.roles.includes(Role.PROVIDER)) {
        throw new ConflictException('User is already a provider');
      }

      return tx.user.update({
        where: { id: userId },
        data: { roles: { push: Role.PROVIDER } },
        select: { id: true, roles: true },
      });
    });
  }

  async grantRunner(userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new BadRequestException('User not found');
      if (user.roles.includes(Role.RUNNER)) {
        throw new ConflictException('User is already a runner');
      }

      const runnerProfile = await tx.runnerProfile.findUnique({
        where: { userId },
      });

      if (!runnerProfile) {
        await tx.runnerProfile.create({
          data: {
            userId,
            baseLat: null,
            baseLng: null,
          },
        });
      }

      return tx.user.update({
        where: { id: userId },
        data: { roles: { push: Role.RUNNER } },
        select: { id: true, roles: true },
      });
    });
  }

  // --- Master Data: Cities ---
  async getAllCities() {
    return this.prisma.city.findMany({ orderBy: { name: 'asc' } });
  }

  async createCity(data: { name: string; slug: string; active?: boolean }) {
    const exists = await this.prisma.city.findUnique({
      where: { slug: data.slug },
    });
    if (exists) throw new ConflictException('City slug already exists');
    return this.prisma.city.create({ data });
  }

  async updateCity(
    id: string,
    data: Partial<{ name: string; slug: string; active: boolean }>,
  ) {
    if (data.slug) {
      const exists = await this.prisma.city.findFirst({
        where: { slug: data.slug, NOT: { id } },
      });
      if (exists) {
        throw new ConflictException('City slug already in use');
      }
    }
    return this.prisma.city.update({ where: { id }, data });
  }

  async deleteCity(id: string) {
    // Check for dependencies
    const products = await this.prisma.product.count({ where: { cityId: id } });
    if (products > 0)
      throw new BadRequestException(
        'Cannot delete city with associated products',
      );

    const orders = await this.prisma.order.count({ where: { cityId: id } });
    if (orders > 0)
      throw new BadRequestException(
        'Cannot delete city with associated orders',
      );

    return this.prisma.city.delete({ where: { id } });
  }

  // --- Master Data: Categories ---
  async getAllCategories() {
    return this.prisma.category.findMany({ orderBy: { name: 'asc' } });
  }

  async createCategory(data: {
    name: string;
    slug: string;
    image_url?: string;
  }) {
    const exists = await this.prisma.category.findUnique({
      where: { slug: data.slug },
    });
    if (exists) throw new ConflictException('Category slug already exists');
    return this.prisma.category.create({ data });
  }

  async updateCategory(
    id: string,
    data: Partial<{ name: string; slug: string; image_url: string }>,
  ) {
    if (data.slug) {
      const exists = await this.prisma.category.findFirst({
        where: { slug: data.slug, NOT: { id } },
      });
      if (exists) {
        throw new ConflictException('Category slug already in use');
      }
    }
    return this.prisma.category.update({ where: { id }, data });
  }

  async deleteCategory(id: string) {
    const products = await this.prisma.product.count({
      where: { categoryId: id },
    });
    if (products > 0)
      throw new BadRequestException(
        'Cannot delete category with associated products',
      );
    return this.prisma.category.delete({ where: { id } });
  }

  // --- Metrics ---
  // --- Metrics ---
  async getMetrics() {
    const [
      totalUsers,
      totalProviders,
      totalClients,
      totalOrders,
      revenueAggregate,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { roles: { has: Role.PROVIDER } } }),
      this.prisma.user.count({ where: { roles: { has: Role.CLIENT } } }),
      this.prisma.order.count(),
      this.prisma.order.aggregate({
        _sum: { totalPrice: true },
        where: {
          status: {
            in: [
              'CONFIRMED',
              'READY_FOR_ASSIGNMENT',
              'ASSIGNED',
              'IN_TRANSIT',
              'DELIVERED',
            ],
          },
        },
      }),
    ]);

    return {
      totalUsers,
      totalProviders,
      totalClients,
      totalOrders,
      totalRevenue: revenueAggregate._sum.totalPrice || 0,
    };
  }
}
