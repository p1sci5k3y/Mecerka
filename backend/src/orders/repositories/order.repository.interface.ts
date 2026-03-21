import { Order, Prisma } from '@prisma/client';

export abstract class IOrderRepository {
  abstract findById(id: string): Promise<Order | null>;
  abstract update(id: string, data: Prisma.OrderUpdateInput): Promise<Order>;
}
