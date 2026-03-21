import { Order, ProviderOrder, Prisma } from '@prisma/client';

export abstract class IOrderRepository {
  abstract findById(id: string): Promise<Order | null>;
  abstract update(id: string, data: Prisma.OrderUpdateInput): Promise<Order>;
  abstract findByClientId(
    clientId: string,
    params?: { skip?: number; take?: number; status?: string },
  ): Promise<Order[]>;
  abstract findWithProviderOrders(
    id: string,
  ): Promise<(Order & { providerOrders: ProviderOrder[] }) | null>;
  abstract countByClient(clientId: string): Promise<number>;
  abstract updateStatus(id: string, status: string): Promise<Order>;
}
