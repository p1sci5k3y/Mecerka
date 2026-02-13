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
  constructor(private readonly prisma: PrismaService) {}

  // --- User Management ---
  async getAllUsers() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        mfaEnabled: true,
        active: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateUserRole(id: number, role: Role, currentAdminId: number) {
    if (id === currentAdminId) {
      throw new ForbiddenException('Cannot change your own role');
    }
    return this.prisma.user.update({
      where: { id },
      data: { role },
      select: { id: true, role: true },
    });
  }

  async activateUser(id: number, currentAdminId: number) {
    if (id === currentAdminId) {
      throw new ForbiddenException('Cannot activate yourself');
    }
    return this.prisma.user.update({
      where: { id },
      data: { active: true },
      select: { id: true, active: true },
    });
  }

  async blockUser(id: number, currentAdminId: number) {
    if (id === currentAdminId) {
      throw new ForbiddenException('Cannot block yourself');
    }
    return this.prisma.user.update({
      where: { id },
      data: { active: false },
      select: { id: true, active: true },
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
    id: number,
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

  async deleteCity(id: number) {
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
    id: number,
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

  async deleteCategory(id: number) {
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
  async getMetrics() {
    const [
      totalUsers,
      totalProviders,
      totalClients,
      totalOrders,
      revenueAggregate,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { role: Role.PROVIDER } }),
      this.prisma.user.count({ where: { role: Role.CLIENT } }),
      this.prisma.order.count(),
      this.prisma.order.aggregate({
        _sum: { totalPrice: true },
        where: { status: 'CONFIRMED' }, // Only count revenue from confirmed orders
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
