import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { CheckoutCartDto } from '../cart/dto/checkout-cart.dto';
import { PrismaService } from '../prisma/prisma.service';
import { DeliveryStatus, ProviderOrderStatus, Prisma } from '@prisma/client';
import { GEOCODING_SERVICE } from '../geocoding/geocoding.constants';
import type {
  GeocodedAddress,
  GeocodingPort,
} from '../geocoding/geocoding.types';
import { Money } from '../domain/value-objects';
import { StockReservationService } from './stock-reservation.service';

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(GEOCODING_SERVICE)
    private readonly geocodingService: GeocodingPort,
    private readonly stockReservationService: StockReservationService,
  ) {}

  private logStructuredEvent(
    event: string,
    payload: Record<string, string | number | boolean | null | undefined>,
    message: string,
  ) {
    this.logger.log(
      JSON.stringify({
        event,
        message,
        ...payload,
      }),
    );
  }

  private buildOrderSummaryDisplayNumber(orderId: string) {
    return `SUM-${orderId.slice(0, 8).toUpperCase()}`;
  }

  private toReservationAwareOrder(order: any) {
    return {
      ...order,
      providerOrders: order.providerOrders.map((providerOrder: any) => {
        const reservationExpiresAt =
          providerOrder.reservations?.length > 0
            ? providerOrder.reservations.reduce(
                (earliest: Date, reservation: any) =>
                  reservation.expiresAt < earliest
                    ? reservation.expiresAt
                    : earliest,
                providerOrder.reservations[0].expiresAt,
              )
            : null;
        const { reservations, ...rest } = providerOrder;
        return {
          ...rest,
          reservationExpiresAt,
        };
      }),
    };
  }

  private roundCoordinate(value: number) {
    return Number(value.toFixed(3));
  }

  private roundDistance(value: number) {
    return Number(value.toFixed(2));
  }

  private calculateDistanceKm(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ) {
    const R = 6371;
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) *
        Math.cos(this.deg2rad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private deg2rad(deg: number) {
    return deg * (Math.PI / 180);
  }

  private resolveCoverageLimitKm(
    discoveryRadiusKm: number,
    providerServiceRadiusKm: number,
    cityMaxDeliveryRadiusKm?: number | null,
  ) {
    const limits = [discoveryRadiusKm, providerServiceRadiusKm];
    if (
      cityMaxDeliveryRadiusKm != null &&
      Number.isFinite(cityMaxDeliveryRadiusKm) &&
      cityMaxDeliveryRadiusKm > 0
    ) {
      limits.push(cityMaxDeliveryRadiusKm);
    }

    return Math.min(...limits);
  }

  private buildDeliveryPricingSnapshot(
    providerCoverage: Array<{ distanceKm: number }>,
    providerCount: number,
    city: {
      baseDeliveryFee: Prisma.Decimal | number | null;
      deliveryPerKmFee: Prisma.Decimal | number | null;
      extraPickupFee: Prisma.Decimal | number | null;
    },
  ) {
    const deliveryDistanceKm = this.roundDistance(
      Math.max(...providerCoverage.map((coverage) => coverage.distanceKm), 0),
    );
    const additionalPickupCount = Math.max(providerCount - 1, 0);
    const runnerBaseFee = Money.of(Number(city.baseDeliveryFee ?? 3.5)).amount;
    const runnerPerKmFee = Money.of(
      Number(city.deliveryPerKmFee ?? 0.9),
    ).amount;
    const runnerExtraPickupFee = Money.of(
      Number(city.extraPickupFee ?? 1.5),
    ).amount;
    const distanceFee =
      Money.of(runnerPerKmFee).multiply(deliveryDistanceKm).amount;
    const extraPickupCharge = Money.of(runnerExtraPickupFee).multiply(
      additionalPickupCount,
    ).amount;
    const deliveryFee = Money.of(runnerBaseFee)
      .add(Money.of(distanceFee))
      .add(Money.of(extraPickupCharge)).amount;

    return {
      deliveryDistanceKm,
      runnerBaseFee,
      runnerPerKmFee,
      runnerExtraPickupFee,
      deliveryFee,
    };
  }

  private async geocodeCheckoutAddress(
    cityName: string,
    dto: CheckoutCartDto,
  ): Promise<GeocodedAddress> {
    const geocodedAddress = await this.geocodingService.geocodeAddress({
      streetAddress: dto.deliveryAddress,
      postalCode: dto.postalCode,
      cityName,
    });

    if (!geocodedAddress) {
      throw new BadRequestException(
        'Delivery address could not be geocoded for the selected city',
      );
    }

    return geocodedAddress;
  }

  private async validateCartForCheckout(
    clientId: string,
    dto: CheckoutCartDto,
  ): Promise<{
    cart: any;
    checkoutCity: any;
    providerOrders: any[];
    totalPrice: number;
  }> {
    const cart = await this.prisma.cartGroup.findFirst({
      where: {
        clientId,
      },
      include: {
        city: {
          select: {
            id: true,
            name: true,
            active: true,
            maxDeliveryRadiusKm: true,
            baseDeliveryFee: true,
            deliveryPerKmFee: true,
            extraPickupFee: true,
          },
        },
        providers: {
          include: {
            items: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!cart) {
      throw new BadRequestException('Active cart is empty');
    }

    if (cart.status !== 'ACTIVE') {
      throw new BadRequestException('Cart is not active');
    }

    if (cart.providers.length === 0) {
      throw new BadRequestException('Active cart is empty');
    }

    if (!cart.cityId) {
      throw new BadRequestException('Active cart has no city assigned');
    }

    if (!cart.city) {
      throw new BadRequestException(
        'Active cart city configuration is missing',
      );
    }

    const checkoutCity = cart.city;

    if (!checkoutCity.active) {
      throw new BadRequestException('Active cart belongs to an inactive city');
    }

    if (dto.cityId !== cart.cityId) {
      throw new BadRequestException(
        'Checkout city does not match the active cart city',
      );
    }

    const providerOrders = cart.providers.filter(
      (provider: any) => provider.items.length > 0,
    );

    if (providerOrders.length === 0) {
      throw new BadRequestException('Active cart has no items to checkout');
    }

    const totalPrice = providerOrders.reduce(
      (acc: Money, provider: any) =>
        acc.add(Money.of(Number(provider.subtotalAmount))),
      Money.of(0),
    ).amount;

    return { cart, checkoutCity, providerOrders, totalPrice };
  }

  private async resolveDeliveryAddresses(
    providerOrders: any[],
    dto: CheckoutCartDto,
    checkoutCity: any,
  ): Promise<{
    geocodedAddress: GeocodedAddress;
    providerCoverageMap: Map<
      string,
      { providerId: string; distanceKm: number; coverageLimitKm: number }
    >;
    deliveryPricing: ReturnType<
      typeof CheckoutService.prototype.buildDeliveryPricingSnapshot
    >;
  }> {
    const geocodedAddress = await this.geocodeCheckoutAddress(
      checkoutCity.name,
      dto,
    );

    const providerIds = providerOrders.map((provider) => provider.providerId);
    const providerUsers = (await this.prisma.user.findMany({
      where: {
        id: {
          in: providerIds,
        },
      },
      select: {
        id: true,
        latitude: true,
        longitude: true,
        providerServiceRadiusKm: true,
      },
    })) as Array<{
      id: string;
      latitude: number | null;
      longitude: number | null;
      providerServiceRadiusKm: number | null;
    }>;
    const providerUserMap = new Map(
      providerUsers.map((provider: any) => [provider.id, provider]),
    );

    const providerCoverage = providerOrders.map((provider) => {
      const providerUser = providerUserMap.get(provider.providerId);

      if (
        !providerUser ||
        providerUser.latitude == null ||
        providerUser.longitude == null
      ) {
        throw new ConflictException(
          `Provider ${provider.providerId} does not have a configured delivery location`,
        );
      }

      const distanceKm = this.roundDistance(
        this.calculateDistanceKm(
          geocodedAddress.latitude,
          geocodedAddress.longitude,
          Number(providerUser.latitude),
          Number(providerUser.longitude),
        ),
      );
      const coverageLimitKm = this.roundDistance(
        this.resolveCoverageLimitKm(
          dto.discoveryRadiusKm,
          Number(providerUser.providerServiceRadiusKm ?? 10),
          checkoutCity.maxDeliveryRadiusKm,
        ),
      );

      if (distanceKm > coverageLimitKm) {
        throw new BadRequestException(
          `Provider ${provider.providerId} is outside the delivery coverage area`,
        );
      }

      return {
        providerId: provider.providerId,
        distanceKm,
        coverageLimitKm,
      };
    });
    const providerCoverageMap = new Map(
      providerCoverage.map((coverage) => [coverage.providerId, coverage]),
    );
    const deliveryPricing = this.buildDeliveryPricingSnapshot(
      providerCoverage,
      providerOrders.length,
      checkoutCity,
    );

    return { geocodedAddress, providerCoverageMap, deliveryPricing };
  }

  private async createOrderWithSuborders(
    clientId: string,
    dto: CheckoutCartDto,
    cart: any,
    providerOrders: any[],
    addresses: {
      geocodedAddress: GeocodedAddress;
      providerCoverageMap: Map<
        string,
        { providerId: string; distanceKm: number; coverageLimitKm: number }
      >;
      deliveryPricing: ReturnType<
        typeof CheckoutService.prototype.buildDeliveryPricingSnapshot
      >;
    },
    totalPrice: number,
    normalizedKey: string,
  ): Promise<any> {
    const { geocodedAddress, providerCoverageMap, deliveryPricing } = addresses;

    return this.prisma.$transaction(async (tx: any) => {
      const requestedItems = providerOrders.flatMap(
        (provider) => provider.items,
      );
      const productIds = [
        ...new Set(requestedItems.map((item) => item.productId)),
      ].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

      if (productIds.length === 0) {
        throw new BadRequestException('Active cart has no items to checkout');
      }

      // Keep checkout and payment confirmation on the same deterministic lock order.
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
                  create: provider.items.map((item: any) => ({
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

  private async initiatePaymentSession(
    order: any,
    _clientId: string,
  ): Promise<any> {
    const orderWithReservations = await (
      this.prisma.order as any
    ).findUniqueOrThrow({
      where: { id: order.id },
      include: {
        summaryDocument: true,
        providerOrders: {
          include: {
            items: true,
            reservations: {
              where: { status: 'ACTIVE' },
              select: {
                expiresAt: true,
              },
            },
          },
        },
      },
    });

    const reservationAwareOrder = this.toReservationAwareOrder(
      orderWithReservations,
    );

    this.logStructuredEvent(
      'order.created',
      {
        orderId: reservationAwareOrder.id,
      },
      'Aggregated order created from cart checkout',
    );

    return reservationAwareOrder;
  }

  async checkoutFromCart(
    clientId: string,
    dto: CheckoutCartDto,
    idempotencyKey?: string,
  ) {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    const normalizedKey = idempotencyKey.trim();
    const existingOrder = await (this.prisma.order as any).findUnique({
      where: {
        checkoutIdempotencyKey: normalizedKey,
      },
      include: {
        summaryDocument: true,
        providerOrders: {
          include: {
            items: true,
            reservations: {
              where: { status: 'ACTIVE' },
              select: {
                expiresAt: true,
              },
            },
          },
        },
      },
    });

    if (existingOrder) {
      if (existingOrder.clientId !== clientId) {
        throw new ForbiddenException(
          'This idempotency key belongs to another client',
        );
      }

      return this.toReservationAwareOrder(existingOrder);
    }

    try {
      const { cart, providerOrders, checkoutCity, totalPrice } =
        await this.validateCartForCheckout(clientId, dto);
      const addresses = await this.resolveDeliveryAddresses(
        providerOrders,
        dto,
        checkoutCity,
      );
      const order = await this.createOrderWithSuborders(
        clientId,
        dto,
        cart,
        providerOrders,
        addresses,
        totalPrice,
        normalizedKey,
      );
      await this.stockReservationService.reserveStockForOrder(order);
      return this.initiatePaymentSession(order, clientId);
    } catch (error: any) {
      if (error?.code === 'P2002') {
        const duplicatedOrder = await (this.prisma.order as any).findUnique({
          where: {
            checkoutIdempotencyKey: normalizedKey,
          },
          include: {
            summaryDocument: true,
            providerOrders: {
              include: {
                items: true,
                reservations: {
                  where: { status: 'ACTIVE' },
                  select: {
                    expiresAt: true,
                  },
                },
              },
            },
          },
        });

        if (duplicatedOrder) {
          if (duplicatedOrder.clientId !== clientId) {
            throw new ForbiddenException(
              'This idempotency key belongs to another client',
            );
          }

          return this.toReservationAwareOrder(duplicatedOrder);
        }
      }

      throw error;
    }
  }
}
