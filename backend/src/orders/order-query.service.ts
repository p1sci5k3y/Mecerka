import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderItemsService } from './order-items.service';
import {
  City,
  DeliveryStatus,
  ProviderOrderStatus,
  Role,
} from '@prisma/client';

interface OrderWithTracking {
  status: string;
  deliveryOrder: { status: string } | null;
}

@Injectable()
export class OrderQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orderItemsService: OrderItemsService,
  ) {}

  private buildOrderTrackingStatus(order: OrderWithTracking) {
    const deliveryOrder = order.deliveryOrder;

    if (!deliveryOrder) {
      return order.status;
    }

    switch (deliveryOrder.status) {
      case 'PICKED_UP':
      case 'IN_TRANSIT':
        return 'DELIVERING';
      case 'DELIVERED':
        return 'DELIVERED';
      case 'RUNNER_ASSIGNED':
      case 'PICKUP_PENDING':
        return 'ASSIGNED';
      case 'CANCELLED':
        return 'CANCELLED';
      default:
        return order.status;
    }
  }

  private toProviderScopedOrderView<T extends { providerId: string }>(
    order: {
      id: string;
      status: string;
      createdAt: Date;
      updatedAt: Date;
      city?: City | null;
      providerOrders: T[];
    },
    providerId: string,
  ) {
    return {
      id: order.id,
      status: order.status,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      city: order.city,
      providerOrders: order.providerOrders.filter(
        (providerOrder) => providerOrder.providerId === providerId,
      ),
    };
  }

  private roundCoordinate(value: number) {
    return Number(value.toFixed(3));
  }

  async getOrderTracking(id: string, userId: string, roles: Role[]) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        providerOrders: {
          select: {
            providerId: true,
          },
        },
        deliveryOrder: {
          select: {
            id: true,
            status: true,
            runnerId: true,
            lastRunnerLocationLat: true,
            lastRunnerLocationLng: true,
            lastLocationUpdateAt: true,
            runner: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }

    if (!roles.includes(Role.ADMIN)) {
      const isClient = order.clientId === userId;
      const isRunner =
        order.deliveryOrder?.runnerId === userId || order.runnerId === userId;
      const isProvider = order.providerOrders.some(
        (providerOrder) => providerOrder.providerId === userId,
      );

      if (!isClient && !isRunner && !isProvider) {
        throw new ForbiddenException(
          'You do not have permission to view this order tracking',
        );
      }
    }

    const deliveryOrder = order.deliveryOrder;
    const hasVisibleLocation =
      deliveryOrder != null &&
      ['PICKED_UP', 'IN_TRANSIT', 'DELIVERED'].includes(deliveryOrder.status) &&
      deliveryOrder.lastRunnerLocationLat != null &&
      deliveryOrder.lastRunnerLocationLng != null;
    const latitude = deliveryOrder?.lastRunnerLocationLat;
    const longitude = deliveryOrder?.lastRunnerLocationLng;

    return {
      orderId: order.id,
      status: this.buildOrderTrackingStatus(order),
      deliveryStatus: deliveryOrder?.status ?? null,
      runner: deliveryOrder?.runner
        ? {
            id: deliveryOrder.runner.id,
            name: deliveryOrder.runner.name,
          }
        : null,
      location: hasVisibleLocation
        ? {
            lat: this.roundCoordinate(latitude as number),
            lng: this.roundCoordinate(longitude as number),
          }
        : null,
      updatedAt: deliveryOrder?.lastLocationUpdateAt ?? null,
    };
  }

  findAll(userId: string, roles: Role[]) {
    if (roles.includes(Role.PROVIDER)) {
      return this.prisma.order
        .findMany({
          where: { providerOrders: { some: { providerId: userId } } },
          include: {
            providerOrders: {
              where: { providerId: userId },
              include: { items: { include: { product: true } } },
            },
            city: true,
            deliveryOrder: {
              select: {
                id: true,
                runnerId: true,
                status: true,
                paymentStatus: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        })
        .then((orders) =>
          orders.map((order) => this.toProviderScopedOrderView(order, userId)),
        );
    } else if (roles.includes(Role.RUNNER)) {
      return this.prisma.order.findMany({
        where: {
          OR: [{ runnerId: userId }, { deliveryOrder: { runnerId: userId } }],
        },
        include: {
          providerOrders: {
            include: { items: { include: { product: true } } },
          },
          city: true,
          deliveryOrder: {
            select: {
              id: true,
              runnerId: true,
              status: true,
              paymentStatus: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    } else if (roles.includes(Role.CLIENT)) {
      return this.prisma.order.findMany({
        where: { clientId: userId },
        include: {
          providerOrders: {
            include: { items: { include: { product: true } } },
          },
          city: true,
          deliveryOrder: {
            select: {
              id: true,
              runnerId: true,
              status: true,
              paymentStatus: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    }
    return [];
  }

  async findOne(id: string, userId: string, roles: Role[]) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        providerOrders: {
          include: {
            provider: {
              select: {
                id: true,
                name: true,
              },
            },
            items: { include: { product: true } },
          },
        },
        deliveryOrder: {
          select: {
            id: true,
            runnerId: true,
            status: true,
            paymentStatus: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }

    if (roles.includes(Role.ADMIN)) return order;

    const isClient = order.clientId === userId;
    const isRunner =
      order.runnerId === userId || order.deliveryOrder?.runnerId === userId;
    const isProvider = order.providerOrders.some(
      (po) => po.providerId === userId,
    );

    if (!isClient && !isRunner && !isProvider) {
      throw new ForbiddenException(
        'You do not have permission to view this order',
      );
    }

    if (isProvider && !isClient && !isRunner) {
      return this.toProviderScopedOrderView(order, userId);
    }

    return order;
  }

  async getAvailableOrders() {
    return this.prisma.order.findMany({
      where: {
        status: DeliveryStatus.READY_FOR_ASSIGNMENT,
        runnerId: null,
      },
      include: {
        providerOrders: {
          include: { items: { include: { product: true } } },
        },
        city: true,
        client: {
          select: { name: true }, // Minimize data exposure
        },
      },
      orderBy: { createdAt: 'desc' },
    });
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

  async getProviderStats(providerId: string) {
    return this.orderItemsService.getProviderStats(providerId);
  }

  async getProviderSalesChart(providerId: string) {
    return this.orderItemsService.getProviderSalesChart(providerId);
  }
}
