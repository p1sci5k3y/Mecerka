import {
  DeliveryStatus,
  Order,
  OrderItem,
  ProviderOrder,
  ProviderOrderStatus,
  Prisma,
} from '@prisma/client';

export type OrderWithProviderOrdersAndItems = Order & {
  providerOrders: (ProviderOrder & { items: OrderItem[] })[];
};

export type ProviderOrderWithOrder = ProviderOrder & { order: Order };

export abstract class IOrderRepository {
  abstract findById(id: string): Promise<Order | null>;
  abstract update(id: string, data: Prisma.OrderUpdateInput): Promise<Order>;
  abstract findByClientId(
    clientId: string,
    params?: { skip?: number; take?: number; status?: DeliveryStatus },
  ): Promise<Order[]>;
  abstract findWithProviderOrders(
    id: string,
  ): Promise<(Order & { providerOrders: ProviderOrder[] }) | null>;
  abstract countByClient(clientId: string): Promise<number>;
  abstract updateStatus(id: string, status: DeliveryStatus): Promise<Order>;

  abstract findWithProviderOrdersAndItems(
    id: string,
  ): Promise<OrderWithProviderOrdersAndItems | null>;
  abstract findProviderOrderWithOrder(
    id: string,
  ): Promise<ProviderOrderWithOrder | null>;
  abstract findProviderOrderById(id: string): Promise<ProviderOrder | null>;
  abstract updateProviderOrderStatusOptimistic(
    id: string,
    currentStatus: ProviderOrderStatus,
    newStatus: ProviderOrderStatus,
  ): Promise<number>;
  abstract updateManyProviderOrdersStatus(
    ids: string[],
    status: ProviderOrderStatus,
  ): Promise<void>;
  abstract acceptOrderOptimistic(id: string, runnerId: string): Promise<number>;
  abstract completeOrderOptimistic(
    id: string,
    runnerId: string,
  ): Promise<number>;
  abstract findRunnerProfile(runnerId: string): Promise<{
    stripeAccountId: string | null;
    runnerProfile: { isActive: boolean } | null;
  } | null>;
  abstract cancelWithInventoryRestore(
    orderId: string,
    providerOrderIdsToCancel: string[],
    itemsToRestore: { productId: string; quantity: number }[],
  ): Promise<OrderWithProviderOrdersAndItems>;
}
