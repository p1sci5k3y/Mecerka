import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { OrderStatusService } from './order-status.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CheckoutCartDto } from '../cart/dto/checkout-cart.dto';
import { PrismaService } from '../prisma/prisma.service';
import { IOrderRepository } from './repositories/order.repository.interface';
import {
  Role,
  DeliveryStatus,
  ProviderOrderStatus,
  PaymentSessionStatus,
  ProviderPaymentStatus,
  Prisma,
} from '@prisma/client';
import * as argon2 from 'argon2';
import { GEOCODING_SERVICE } from '../geocoding/geocoding.constants';
import type {
  GeocodedAddress,
  GeocodingPort,
} from '../geocoding/geocoding.types';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RiskService } from '../risk/risk.service';
import { OrderItemsService } from './order-items.service';
import { Money } from '../domain/value-objects';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    @Inject(GEOCODING_SERVICE)
    private readonly geocodingService: GeocodingPort,
    private readonly orderItemsService: OrderItemsService,
    private readonly orderStatusService: OrderStatusService,
    @Inject(IOrderRepository)
    private readonly orderRepository: IOrderRepository,
    @Optional() private readonly riskService?: RiskService,
  ) {}

  private readonly providerPaymentProvider = 'internal-mvp';

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

  private buildProviderPaymentUrl(providerOrderId: string, sessionId: string) {
    return `/provider-orders/${providerOrderId}/payment-sessions/${sessionId}`;
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

  private buildOrderTrackingStatus(order: any) {
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

  async prepareProviderOrderPayment(providerOrderId: string) {
    const now = new Date();
    return this.prisma.$transaction(async (tx: any) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT 1 FROM "ProviderOrder" WHERE "id" = ${providerOrderId}::uuid FOR UPDATE`,
      );

      const providerOrder = await tx.providerOrder.findUnique({
        where: { id: providerOrderId },
        include: {
          reservations: {
            where: {
              status: 'ACTIVE',
              expiresAt: { gt: now },
            },
            select: {
              expiresAt: true,
            },
          },
          paymentSessions: {
            where: {
              status: {
                in: [PaymentSessionStatus.CREATED, PaymentSessionStatus.READY],
              },
              OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      if (!providerOrder) {
        throw new NotFoundException('ProviderOrder not found');
      }

      if (
        ![
          ProviderOrderStatus.PENDING,
          ProviderOrderStatus.PAYMENT_PENDING,
          ProviderOrderStatus.PAYMENT_READY,
        ].includes(providerOrder.status)
      ) {
        throw new ConflictException(
          'ProviderOrder is not eligible for payment preparation',
        );
      }

      if (providerOrder.paymentStatus === ProviderPaymentStatus.PAID) {
        throw new ConflictException('ProviderOrder is already paid');
      }

      const reservationExpiresAt =
        providerOrder.reservations.length > 0
          ? providerOrder.reservations.reduce(
              (earliest: Date, reservation: { expiresAt: Date }) =>
                reservation.expiresAt < earliest
                  ? reservation.expiresAt
                  : earliest,
              providerOrder.reservations[0].expiresAt,
            )
          : null;

      if (!reservationExpiresAt) {
        throw new ConflictException(
          'ProviderOrder has no active stock reservation for payment',
        );
      }

      const existingSession = providerOrder.paymentSessions[0];
      if (existingSession) {
        await tx.providerOrder.update({
          where: { id: providerOrderId },
          data: {
            paymentStatus: ProviderPaymentStatus.PAYMENT_READY,
            paymentReadyAt: providerOrder.paymentReadyAt ?? now,
            paymentExpiresAt: reservationExpiresAt,
            status:
              providerOrder.status === ProviderOrderStatus.PENDING
                ? ProviderOrderStatus.PAYMENT_READY
                : providerOrder.status,
          },
        });

        return existingSession;
      }

      const createdSession = await tx.providerPaymentSession.create({
        data: {
          providerOrderId,
          paymentProvider: this.providerPaymentProvider,
          status: PaymentSessionStatus.READY,
          expiresAt: reservationExpiresAt,
        },
      });

      const paymentUrl = this.buildProviderPaymentUrl(
        providerOrderId,
        createdSession.id,
      );

      const readySession = await tx.providerPaymentSession.update({
        where: { id: createdSession.id },
        data: {
          paymentUrl,
        },
      });

      await tx.providerOrder.update({
        where: { id: providerOrderId },
        data: {
          paymentStatus: ProviderPaymentStatus.PAYMENT_READY,
          paymentReadyAt: now,
          paymentExpiresAt: reservationExpiresAt,
          status:
            providerOrder.status === ProviderOrderStatus.PENDING
              ? ProviderOrderStatus.PAYMENT_READY
              : providerOrder.status,
        },
      });

      return readySession;
    });
  }

  async expireReservations(now = new Date()) {
    const expiredReservations = await (
      this.prisma as any
    ).stockReservation.findMany({
      where: {
        status: 'ACTIVE',
        expiresAt: {
          lt: now,
        },
      },
      select: {
        id: true,
        providerOrderId: true,
      },
    });

    if (expiredReservations.length === 0) {
      return { expiredReservations: 0, expiredProviderOrders: 0 };
    }

    const providerOrderIds = [
      ...new Set(
        expiredReservations.map(
          (reservation: { providerOrderId: string }) =>
            reservation.providerOrderId,
        ),
      ),
    ];

    const result = await this.prisma.$transaction(async (tx: any) => {
      const reservationResult = await tx.stockReservation.updateMany({
        where: {
          id: {
            in: expiredReservations.map(
              (reservation: { id: string }) => reservation.id,
            ),
          },
        },
        data: {
          status: 'EXPIRED',
        },
      });

      const providerOrderResult = await tx.providerOrder.updateMany({
        where: {
          id: {
            in: providerOrderIds,
          },
          status: {
            in: [
              ProviderOrderStatus.PENDING,
              ProviderOrderStatus.PAYMENT_PENDING,
              ProviderOrderStatus.PAYMENT_READY,
            ],
          },
        },
        data: {
          status: ProviderOrderStatus.EXPIRED,
        },
      });

      return {
        expiredReservations: reservationResult.count,
        expiredProviderOrders: providerOrderResult.count,
      };
    });

    return result;
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
      await this.reserveStockForOrder(order);
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
      typeof OrdersService.prototype.buildDeliveryPricingSnapshot
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
        typeof OrdersService.prototype.buildDeliveryPricingSnapshot
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

      const products = await tx.product.findMany({
        where: {
          id: {
            in: productIds,
          },
        },
        select: {
          id: true,
          stock: true,
        },
      });
      const reservations = await tx.stockReservation.groupBy({
        by: ['productId'],
        where: {
          productId: {
            in: productIds,
          },
          status: 'ACTIVE',
          expiresAt: {
            gt: new Date(),
          },
        },
        _sum: {
          quantity: true,
        },
      });

      const productStock = new Map(
        products.map((product: any) => [product.id, Number(product.stock)]),
      );
      const reservedStock = new Map(
        reservations.map((reservation: any) => [
          reservation.productId,
          reservation._sum.quantity ?? 0,
        ]),
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

  private async reserveStockForOrder(order: any): Promise<void> {
    const reservationExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await this.prisma.stockReservation.createMany({
      data: order.providerOrders.flatMap((providerOrder: any) =>
        providerOrder.items.map((item: any) => ({
          providerOrderId: providerOrder.id,
          productId: item.productId,
          quantity: item.quantity,
          status: 'ACTIVE',
          expiresAt: reservationExpiresAt,
        })),
      ),
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

  async create(createOrderDto: CreateOrderDto, clientId: string) {
    const { items, deliveryAddress, pin, deliveryLat, deliveryLng } =
      createOrderDto;

    // 0. Verify Transactional PIN (if provided)
    if (pin) {
      const user = await this.prisma.user.findUnique({
        where: { id: clientId },
      });
      if (!user) throw new NotFoundException('Usuario no encontrado');
      if (!user.pin)
        throw new BadRequestException(
          'Debes configurar un PIN de compra en tu perfil.',
        );
      const isPinValid = await argon2.verify(user.pin, pin);
      if (!isPinValid)
        throw new UnauthorizedException('PIN de compra incorrecto.');
    }

    // 1. Consolidate Duplicate Items in Memory
    const aggregatedItems: { productId: string; quantity: number }[] = [];
    const quantityMap = new Map<string, number>();

    for (const item of items) {
      quantityMap.set(
        item.productId,
        (quantityMap.get(item.productId) || 0) + item.quantity,
      );
    }
    quantityMap.forEach((qty, productId) => {
      aggregatedItems.push({ productId, quantity: qty });
    });

    // 2. Fetch products (Single Query without filtering active yet)
    const productIds = aggregatedItems.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        name: true,
        stock: true,
        isActive: true,
        cityId: true,
        price: true,
        providerId: true,
        provider: { select: { stripeAccountId: true } },
      },
    });

    // 3. Validation: Existence
    if (products.length !== productIds.length) {
      const foundIds = new Set(products.map((p) => p.id));
      const missingIds = productIds.filter((id) => !foundIds.has(id));
      throw new NotFoundException(
        `Algunos productos no existen: ${missingIds.join(', ')}`,
      );
    }

    // 4. Validation: Active Status & KYC Status
    for (const product of products) {
      if (!product.isActive) {
        throw new BadRequestException(
          `El producto '${product.name}' ya no está disponible (inactivo)`,
        );
      }
      if (!product.provider.stripeAccountId) {
        throw new BadRequestException(
          `El producto '${product.name}' pertenece a un proveedor sin cuenta de pagos verificada. Compra no procesable por seguridad.`,
        );
      }
    }

    // 5. Validation: Single City
    const distinctCityIds = new Set(products.map((p) => p.cityId));
    if (distinctCityIds.size > 1) {
      throw new BadRequestException(
        'No se puede mezclar productos de distintas ciudades en un mismo pedido',
      );
    }
    const cityId = distinctCityIds.values().next().value as string;

    // 6. Validation: Optimistic Stock Check
    for (const item of aggregatedItems) {
      const product = products.find((p) => p.id === item.productId)!;
      if (product.stock < item.quantity) {
        throw new BadRequestException(
          `Stock insuficiente para el producto '${product.name}' (Solicitado: ${item.quantity}, Disponible: ${product.stock})`,
        );
      }
    }

    // 7. Group by Provider payload using aggregated items
    const providerGroups: Record<string, { items: any[]; subtotal: number }> =
      {};
    let orderTotalMoney = Money.of(0);

    for (const item of aggregatedItems) {
      const product = products.find((p) => p.id === item.productId)!;
      const providerId = product.providerId;
      const itemMoney = Money.of(Number(product.price)).multiply(item.quantity);

      orderTotalMoney = orderTotalMoney.add(itemMoney);

      if (!providerGroups[providerId]) {
        providerGroups[providerId] = { items: [], subtotal: 0 };
      }

      providerGroups[providerId].items.push({
        productId: product.id,
        quantity: item.quantity,
        priceAtPurchase: product.price,
        unitBasePriceSnapshot: product.price,
        discountPriceSnapshot: null,
      });
      providerGroups[providerId].subtotal = Money.of(
        providerGroups[providerId].subtotal,
      ).add(itemMoney).amount;
    }

    const orderTotalPrice = orderTotalMoney.amount;

    if (Object.keys(providerGroups).length !== 1) {
      throw new BadRequestException(
        'El flujo de pago actual solo admite pedidos de un único proveedor.',
      );
    }

    // 5. Calculate Logistics Economics dynamically on root payload
    const baseCityFee = 3.5; // Note: Fetch from config/DB map
    const multiStopPenalty = 1.5;
    const providerCount = Object.keys(providerGroups).length;
    const deliveryFee = Money.of(baseCityFee).add(
      Money.of(multiStopPenalty).multiply(providerCount - 1),
    ).amount;

    // 6. Create Order and ProviderOrders (NO STOCK LOCK YET)
    const order = await this.prisma.order.create({
      data: {
        clientId,
        cityId,
        checkoutIdempotencyKey: `manual-order-${clientId}-${Date.now()}`,
        totalPrice: orderTotalPrice,
        deliveryFee,
        status: DeliveryStatus.PENDING,
        deliveryAddress,
        deliveryLat,
        deliveryLng,
        providerOrders: {
          create: Object.entries(providerGroups).map(([providerId, group]) => ({
            providerId,
            status: ProviderOrderStatus.PENDING,
            subtotalAmount: group.subtotal,
            paymentStatus: 'PENDING',
            items: { create: group.items },
          })),
        },
      },
      include: {
        providerOrders: { include: { items: true } },
      },
    });

    this.logStructuredEvent(
      'order.created',
      {
        orderId: order.id,
      },
      'Order created through legacy manual flow',
    );

    return order;
  }

  private toProviderScopedOrderView(order: any, providerId: string) {
    return {
      id: order.id,
      status: order.status,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      city: order.city,
      providerOrders: order.providerOrders.filter(
        (providerOrder: any) => providerOrder.providerId === providerId,
      ),
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
          },
          orderBy: { createdAt: 'desc' },
        })
        .then((orders) =>
          orders.map((order) => this.toProviderScopedOrderView(order, userId)),
        );
    } else if (roles.includes(Role.RUNNER)) {
      return this.prisma.order.findMany({
        where: { runnerId: userId },
        include: {
          providerOrders: {
            include: { items: { include: { product: true } } },
          },
          city: true,
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
    const isRunner = order.runnerId === userId;
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

  private async checkAndDecrementStock(
    tx: Prisma.TransactionClient,
    items: { productId: string; quantity: number }[],
  ): Promise<boolean> {
    const productIds = items.map((i) => i.productId);
    const products = await tx.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, stock: true, isActive: true },
    });
    const productMap = new Map(products.map((p: any) => [p.id, p]));

    for (const item of items) {
      const p: any = productMap.get(item.productId);
      if (!p?.isActive || p.stock < item.quantity) {
        return false;
      }
    }

    for (const item of items) {
      const res = await tx.product.updateMany({
        where: {
          id: item.productId,
          isActive: true,
          stock: { gte: item.quantity },
        },
        data: { stock: { decrement: item.quantity } },
      });

      if (res.count !== 1) {
        throw new ConflictException(
          'Concurrent stock update detected; retry payment confirmation',
        );
      }
    }

    return true;
  }

  private async evaluateProviderOrdersStock(
    tx: Prisma.TransactionClient,
    providerOrders: any[],
  ): Promise<{ rejected: string[]; confirmed: string[] }> {
    const rejected: string[] = [];
    const confirmed: string[] = [];

    for (const po of providerOrders) {
      if (
        po.status === ProviderOrderStatus.CANCELLED ||
        po.status === ProviderOrderStatus.REJECTED_BY_STORE
      ) {
        rejected.push(po.id);
        continue;
      }

      const providerOk = await this.checkAndDecrementStock(tx, po.items);

      if (providerOk) {
        confirmed.push(po.id);
      } else {
        rejected.push(po.id);
      }
    }

    return { rejected, confirmed };
  }

  async evaluateReadyForAssignment(orderId: string) {
    return this.orderStatusService.evaluateReadyForAssignment(orderId);
  }

  async updateProviderOrderStatus(
    providerOrderId: string,
    userId: string,
    roles: Role[],
    status: ProviderOrderStatus,
  ) {
    return this.orderStatusService.updateProviderOrderStatus(
      providerOrderId,
      userId,
      roles,
      status,
    );
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

  async acceptOrder(id: string, runnerId: string) {
    return this.orderStatusService.acceptOrder(id, runnerId);
  }

  async completeOrder(id: string, runnerId: string) {
    return this.orderStatusService.completeOrder(id, runnerId);
  }

  async markInTransit(id: string, runnerId: string) {
    return this.orderStatusService.markInTransit(id, runnerId);
  }

  async cancelOrder(id: string, userId: string, roles: Role[]) {
    return this.orderStatusService.cancelOrder(id, userId, roles);
  }

  async getProviderStats(providerId: string) {
    return this.orderItemsService.getProviderStats(providerId);
  }

  async getProviderSalesChart(providerId: string) {
    return this.orderItemsService.getProviderSalesChart(providerId);
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
        stat.revenue = Money.of(stat.revenue).add(
          Money.of(Number(item.priceAtPurchase)).multiply(item.quantity),
        ).amount;
        stat.quantity += item.quantity;
      });
    });

    return Array.from(productStats.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }
}
