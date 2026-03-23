import { Injectable } from '@nestjs/common';
import {
  Order,
  OrderItem,
  ProviderOrder,
  ProviderOrderStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  IOrderRepository,
  OrderWithProviderOrdersAndItems,
  ProviderOrderWithOrder,
} from './order.repository.interface';
import { DeliveryStatus } from '@prisma/client';

@Injectable()
export class PrismaOrderRepository implements IOrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<Order | null> {
    return this.prisma.order.findUnique({ where: { id } });
  }

  update(id: string, data: Prisma.OrderUpdateInput): Promise<Order> {
    return this.prisma.order.update({ where: { id }, data });
  }

  findByClientId(
    clientId: string,
    params?: { skip?: number; take?: number; status?: DeliveryStatus },
  ): Promise<Order[]> {
    return this.prisma.order.findMany({
      where: {
        clientId,
        ...(params?.status ? { status: params.status } : {}),
      },
      skip: params?.skip,
      take: params?.take,
      orderBy: { createdAt: 'desc' },
    });
  }

  findWithProviderOrders(
    id: string,
  ): Promise<(Order & { providerOrders: ProviderOrder[] }) | null> {
    return this.prisma.order.findUnique({
      where: { id },
      include: { providerOrders: true },
    });
  }

  countByClient(clientId: string): Promise<number> {
    return this.prisma.order.count({ where: { clientId } });
  }

  updateStatus(id: string, status: DeliveryStatus): Promise<Order> {
    return this.prisma.order.update({
      where: { id },
      data: { status },
    });
  }

  findWithProviderOrdersAndItems(
    id: string,
  ): Promise<OrderWithProviderOrdersAndItems | null> {
    return this.prisma.order.findUnique({
      where: { id },
      include: { providerOrders: { include: { items: true } } },
    }) as Promise<OrderWithProviderOrdersAndItems | null>;
  }

  findProviderOrderWithOrder(
    id: string,
  ): Promise<ProviderOrderWithOrder | null> {
    return this.prisma.providerOrder.findUnique({
      where: { id },
      include: { order: true },
    });
  }

  findProviderOrderById(id: string): Promise<ProviderOrder | null> {
    return this.prisma.providerOrder.findUnique({ where: { id } });
  }

  async updateProviderOrderStatusOptimistic(
    id: string,
    currentStatus: ProviderOrderStatus,
    newStatus: ProviderOrderStatus,
  ): Promise<number> {
    const result = await this.prisma.providerOrder.updateMany({
      where: { id, status: currentStatus },
      data: { status: newStatus },
    });
    return result.count;
  }

  async updateManyProviderOrdersStatus(
    ids: string[],
    status: ProviderOrderStatus,
  ): Promise<void> {
    await this.prisma.providerOrder.updateMany({
      where: { id: { in: ids } },
      data: { status },
    });
  }

  async acceptOrderOptimistic(id: string, runnerId: string): Promise<number> {
    const result = await this.prisma.order.updateMany({
      where: {
        id,
        status: DeliveryStatus.READY_FOR_ASSIGNMENT,
        runnerId: null,
        clientId: { not: runnerId },
      },
      data: { runnerId, status: DeliveryStatus.ASSIGNED },
    });
    return result.count;
  }

  async completeOrderOptimistic(id: string, runnerId: string): Promise<number> {
    const result = await this.prisma.order.updateMany({
      where: { id, runnerId, status: DeliveryStatus.IN_TRANSIT },
      data: { status: DeliveryStatus.DELIVERED },
    });
    return result.count;
  }

  findRunnerProfile(runnerId: string): Promise<{
    stripeAccountId: string | null;
    runnerProfile: { isActive: boolean } | null;
  } | null> {
    return this.prisma.user.findUnique({
      where: { id: runnerId },
      select: {
        stripeAccountId: true,
        runnerProfile: { select: { isActive: true } },
      },
    });
  }

  async cancelWithInventoryRestore(
    orderId: string,
    providerOrderIdsToCancel: string[],
    itemsToRestore: { productId: string; quantity: number }[],
  ): Promise<OrderWithProviderOrdersAndItems> {
    return this.prisma.$transaction(async (tx) => {
      for (const item of itemsToRestore) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }

      if (providerOrderIdsToCancel.length > 0) {
        await tx.providerOrder.updateMany({
          where: { id: { in: providerOrderIdsToCancel } },
          data: { status: ProviderOrderStatus.CANCELLED },
        });
      }

      return tx.order.update({
        where: { id: orderId },
        data: { status: DeliveryStatus.CANCELLED },
        include: { providerOrders: { include: { items: true } } },
      }) as Promise<OrderWithProviderOrdersAndItems>;
    });
  }
}
