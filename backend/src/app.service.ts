import { Injectable } from '@nestjs/common';
import {
  DeliveryOrderStatus,
  DeliveryStatus,
  Prisma,
  Role,
} from '@prisma/client';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AppService {
  private readonly bootedAt = Date.now();

  constructor(private readonly prisma: PrismaService) {}

  getHello(): string {
    return 'Hello World!';
  }

  async getHealth() {
    let database: 'ok' | 'error' = 'ok';

    try {
      await this.prisma.$queryRaw(Prisma.sql`SELECT 1`);
    } catch {
      database = 'error';
    }

    return {
      status: database === 'ok' ? 'ok' : 'error',
      uptime: Math.floor((Date.now() - this.bootedAt) / 1000),
      timestamp: new Date().toISOString(),
      services: {
        database,
        api: 'ok' as const,
      },
    };
  }

  async getMetrics() {
    const [
      users,
      providers,
      totalOrders,
      pendingOrders,
      deliveringOrders,
      deliveredOrders,
      deliveriesActive,
      products,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({
        where: { roles: { has: Role.PROVIDER } },
      }),
      this.prisma.order.count(),
      this.prisma.order.count({
        where: {
          status: {
            in: [
              DeliveryStatus.PENDING,
              DeliveryStatus.CONFIRMED,
              DeliveryStatus.READY_FOR_ASSIGNMENT,
            ],
          },
        },
      }),
      this.prisma.order.count({
        where: {
          status: {
            in: [DeliveryStatus.ASSIGNED, DeliveryStatus.IN_TRANSIT],
          },
        },
      }),
      this.prisma.order.count({
        where: { status: DeliveryStatus.DELIVERED },
      }),
      this.prisma.deliveryOrder.count({
        where: {
          status: {
            in: [
              DeliveryOrderStatus.RUNNER_ASSIGNED,
              DeliveryOrderStatus.PICKUP_PENDING,
              DeliveryOrderStatus.PICKED_UP,
              DeliveryOrderStatus.IN_TRANSIT,
            ],
          },
        },
      }),
      this.prisma.product.count({
        where: { isActive: true },
      }),
    ]);

    return {
      users,
      providers,
      orders: {
        total: totalOrders,
        pending: pendingOrders,
        delivering: deliveringOrders,
        delivered: deliveredOrders,
      },
      deliveriesActive,
      products,
    };
  }
}
