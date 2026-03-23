import { BadRequestException } from '@nestjs/common';
import { DeliveryStatus, Prisma, ProviderOrderStatus } from '@prisma/client';
import { CheckoutCartDto } from '../cart/dto/checkout-cart.dto';
import { PrismaService } from '../prisma/prisma.service';
import { CheckoutDeliveryPlanningResult } from './checkout-delivery-planning.service';
import { StockReservationService } from './stock-reservation.service';

type CheckoutItemSnapshot = {
  productId: string;
  quantity: number;
  effectiveUnitPriceSnapshot: Prisma.Decimal | number | string;
  unitPriceSnapshot: Prisma.Decimal | number | string;
  discountPriceSnapshot: Prisma.Decimal | number | string | null;
};

type CheckoutProviderGroup = {
  providerId: string;
  subtotalAmount: Prisma.Decimal | number | string;
  items: CheckoutItemSnapshot[];
};

type CheckoutCart = {
  id: string;
  cityId: string;
};

export class CheckoutOrderCreationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stockReservationService: StockReservationService,
  ) {}

  async createOrderWithSuborders(
    clientId: string,
    dto: CheckoutCartDto,
    cart: CheckoutCart,
    providerOrders: CheckoutProviderGroup[],
    addresses: CheckoutDeliveryPlanningResult,
    totalPrice: number,
    normalizedKey: string,
  ) {
    const { geocodedAddress, providerCoverageMap, deliveryPricing } = addresses;

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const requestedItems = providerOrders.flatMap(
        (provider) => provider.items,
      );
      const productIds = [
        ...new Set(requestedItems.map((item) => item.productId)),
      ].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

      if (productIds.length === 0) {
        throw new BadRequestException('Active cart has no items to checkout');
      }

      await tx.$executeRaw(
        Prisma.sql`SELECT 1 FROM "Product" WHERE "id" IN (${Prisma.join(
          productIds.map((id) => Prisma.sql`${id}::uuid`),
        )}) FOR UPDATE`,
      );

      await this.stockReservationService.checkStockAvailability(
        requestedItems,
        productIds,
        tx,
      );

      const order = await tx.order.create({
        data: {
          clientId,
          cityId: cart.cityId,
          totalPrice,
          deliveryFee: deliveryPricing.deliveryFee,
          deliveryDistanceKm: deliveryPricing.deliveryDistanceKm,
          status: DeliveryStatus.PENDING,
          checkoutIdempotencyKey: normalizedKey,
          deliveryAddress: dto.deliveryAddress,
          postalCode: dto.postalCode,
          addressReference: dto.addressReference ?? null,
          deliveryLat: geocodedAddress.latitude,
          deliveryLng: geocodedAddress.longitude,
          discoveryRadiusKm: dto.discoveryRadiusKm,
          runnerBaseFee: deliveryPricing.runnerBaseFee,
          runnerPerKmFee: deliveryPricing.runnerPerKmFee,
          runnerExtraPickupFee: deliveryPricing.runnerExtraPickupFee,
          providerOrders: {
            create: providerOrders.map((provider) => {
              const coverage = providerCoverageMap.get(provider.providerId);

              return {
                providerId: provider.providerId,
                status: ProviderOrderStatus.PENDING,
                subtotalAmount: provider.subtotalAmount,
                paymentStatus: 'PENDING',
                deliveryDistanceKm: coverage?.distanceKm,
                coverageLimitKm: coverage?.coverageLimitKm,
                items: {
                  create: provider.items.map((item) => ({
                    productId: item.productId,
                    quantity: item.quantity,
                    priceAtPurchase: item.effectiveUnitPriceSnapshot,
                    unitBasePriceSnapshot: item.unitPriceSnapshot,
                    discountPriceSnapshot: item.discountPriceSnapshot,
                  })),
                },
              };
            }),
          },
        },
        include: {
          providerOrders: {
            include: {
              items: true,
            },
          },
        },
      });

      await tx.orderSummaryDocument.create({
        data: {
          orderId: order.id,
          displayNumber: this.buildOrderSummaryDisplayNumber(order.id),
          totalAmount: totalPrice,
          currency: 'EUR',
        },
      });

      await tx.cartGroup.update({
        where: { id: cart.id },
        data: {
          status: 'CHECKED_OUT',
          version: {
            increment: 1,
          },
        },
      });

      return order;
    });
  }

  private buildOrderSummaryDisplayNumber(orderId: string) {
    return `SUM-${orderId.slice(0, 8).toUpperCase()}`;
  }
}
