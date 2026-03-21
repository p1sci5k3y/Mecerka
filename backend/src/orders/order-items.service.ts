import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProviderOrderStatus } from '@prisma/client';

@Injectable()
export class OrderItemsService {
  constructor(private readonly prisma: PrismaService) {}

  async getProviderStats(providerId: string) {
    const providerOrders = await this.prisma.providerOrder.findMany({
      where: {
        providerId,
        status: {
          in: [
            ProviderOrderStatus.ACCEPTED,
            ProviderOrderStatus.PREPARING,
            ProviderOrderStatus.READY_FOR_PICKUP,
            ProviderOrderStatus.PICKED_UP,
          ],
        },
      },
      include: {
        items: true,
      },
    });

    const totalRevenue = providerOrders.reduce((sum, po) => {
      const poTotal = po.items.reduce(
        (acc, item) => acc + Number(item.priceAtPurchase) * item.quantity,
        0,
      );
      return sum + poTotal;
    }, 0);

    const totalOrders = providerOrders.length;
    const itemsSold = providerOrders.reduce((sum, po) => {
      return sum + po.items.reduce((acc, item) => acc + item.quantity, 0);
    }, 0);

    const averageTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    return {
      totalRevenue,
      totalOrders,
      itemsSold,
      averageTicket,
    };
  }

  async getProviderSalesChart(providerId: string) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const providerOrders = await this.prisma.providerOrder.findMany({
      where: {
        providerId,
        createdAt: { gte: thirtyDaysAgo },
        status: {
          in: [
            ProviderOrderStatus.ACCEPTED,
            ProviderOrderStatus.PREPARING,
            ProviderOrderStatus.READY_FOR_PICKUP,
            ProviderOrderStatus.PICKED_UP,
          ],
        },
      },
      include: {
        items: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const salesByDate: Record<string, number> = {};

    providerOrders.forEach((po) => {
      const date = po.createdAt.toISOString().split('T')[0];
      const poTotal = po.items.reduce(
        (acc, item) => acc + Number(item.priceAtPurchase) * item.quantity,
        0,
      );
      salesByDate[date] = (salesByDate[date] || 0) + poTotal;
    });

    return Object.entries(salesByDate).map(([date, amount]) => ({
      date,
      amount,
    }));
  }

  async getProviderTopProducts(providerId: string) {
    const providerOrders = await this.prisma.providerOrder.findMany({
      where: {
        providerId,
        status: {
          in: [
            ProviderOrderStatus.ACCEPTED,
            ProviderOrderStatus.PREPARING,
            ProviderOrderStatus.READY_FOR_PICKUP,
            ProviderOrderStatus.PICKED_UP,
          ],
        },
      },
      include: {
        items: { include: { product: true } },
      },
    });

    const productStats = new Map<
      string,
      { name: string; revenue: number; quantity: number }
    >();

    providerOrders.forEach((po) => {
      po.items.forEach((item) => {
        if (!productStats.has(item.productId)) {
          productStats.set(item.productId, {
            name: item.product.name,
            revenue: 0,
            quantity: 0,
          });
        }
        const stat = productStats.get(item.productId)!;
        stat.revenue += Number(item.priceAtPurchase) * item.quantity;
        stat.quantity += item.quantity;
      });
    });

    return Array.from(productStats.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }
}
