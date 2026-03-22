import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface StockItem {
  productId: string;
  quantity: number;
}

interface OrderForReservation {
  providerOrders: Array<{
    id: string;
    items: Array<StockItem>;
  }>;
}

@Injectable()
export class StockReservationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Acquires row-level locks on products and verifies sufficient available stock
   * (accounting for active reservations) for all requested items.
   * Must be called inside a Prisma transaction.
   */
  async checkStockAvailability(
    requestedItems: StockItem[],
    productIds: string[],
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await tx.$executeRaw(
      Prisma.sql`SELECT 1 FROM "Product" WHERE "id" IN (${Prisma.join(
        productIds.map((id) => Prisma.sql`${id}::uuid`),
      )}) FOR UPDATE`,
    );

    const products = await tx.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, stock: true },
    });

    const reservations = await tx.stockReservation.groupBy({
      by: ['productId'],
      where: {
        productId: { in: productIds },
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
      },
      _sum: { quantity: true },
    });

    const productStock = new Map(
      products.map((product: { id: string; stock: unknown }) => [
        product.id,
        Number(product.stock),
      ]),
    );
    const reservedStock = new Map(
      reservations.map(
        (reservation: {
          productId: string;
          _sum: { quantity: number | null };
        }) => [reservation.productId, reservation._sum.quantity ?? 0],
      ),
    );

    for (const item of requestedItems) {
      const currentStock = Number(
        productStock.get(item.productId) ?? Number.NaN,
      );
      if (Number.isNaN(currentStock)) {
        throw new ConflictException('STOCK_UNAVAILABLE');
      }
      const availableStock =
        currentStock - Number(reservedStock.get(item.productId) ?? 0);

      if (availableStock < item.quantity) {
        throw new ConflictException('STOCK_UNAVAILABLE');
      }
    }
  }

  /**
   * Creates active stock reservation records for all items in the order.
   * Reservations expire after 15 minutes.
   */
  async reserveStockForOrder(order: OrderForReservation): Promise<void> {
    const reservationExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await this.prisma.stockReservation.createMany({
      data: order.providerOrders.flatMap((providerOrder) =>
        providerOrder.items.map((item) => ({
          providerOrderId: providerOrder.id,
          productId: item.productId,
          quantity: item.quantity,
          status: 'ACTIVE',
          expiresAt: reservationExpiresAt,
        })),
      ),
    });
  }
}
