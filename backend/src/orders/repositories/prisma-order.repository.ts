import { Injectable } from '@nestjs/common';
import { Order, ProviderOrder, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { IOrderRepository } from './order.repository.interface';

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
    params?: { skip?: number; take?: number; status?: string },
  ): Promise<Order[]> {
    return this.prisma.order.findMany({
      where: {
        clientId,
        ...(params?.status ? { status: params.status as any } : {}),
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

  updateStatus(id: string, status: string): Promise<Order> {
    return this.prisma.order.update({
      where: { id },
      data: { status: status as any },
    });
  }
}
