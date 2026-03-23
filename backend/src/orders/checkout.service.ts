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
import {
  CheckoutDeliveryPlanningResult,
  CheckoutDeliveryPlanningService,
} from './checkout-delivery-planning.service';
import {
  CheckoutCartValidationService,
  CheckoutProviderGroup,
  ValidatedCheckoutCart,
} from './checkout-cart-validation.service';
import { CheckoutOrderCreationService } from './checkout-order-creation.service';

const checkoutOrderInclude = Prisma.validator<Prisma.OrderInclude>()({
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
});

type CheckoutOrderWithReservations = Prisma.OrderGetPayload<{
  include: typeof checkoutOrderInclude;
}>;

type ReservationAwareProviderOrder = Omit<
  CheckoutOrderWithReservations['providerOrders'][number],
  'reservations'
> & {
  reservationExpiresAt: Date | null;
};

type ReservationAwareOrder = Omit<
  CheckoutOrderWithReservations,
  'providerOrders'
> & {
  providerOrders: ReservationAwareProviderOrder[];
};

type CheckoutOrderRecord = Awaited<
  ReturnType<CheckoutOrderCreationService['createOrderWithSuborders']>
>;

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);
  private readonly deliveryPlanningService: CheckoutDeliveryPlanningService;
  private readonly cartValidationService: CheckoutCartValidationService;
  private readonly orderCreationService: CheckoutOrderCreationService;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(GEOCODING_SERVICE)
    private readonly geocodingService: GeocodingPort,
    private readonly stockReservationService: StockReservationService,
  ) {
    this.deliveryPlanningService = new CheckoutDeliveryPlanningService(
      this.prisma,
      this.geocodingService,
    );
    this.cartValidationService = new CheckoutCartValidationService(this.prisma);
    this.orderCreationService = new CheckoutOrderCreationService(
      this.prisma,
      this.stockReservationService,
    );
  }

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

  private toReservationAwareOrder(
    order: CheckoutOrderWithReservations,
  ): ReservationAwareOrder {
    return {
      ...order,
      providerOrders: order.providerOrders.map((providerOrder) => {
        const reservationExpiresAt =
          providerOrder.reservations?.length > 0
            ? providerOrder.reservations.reduce(
                (earliest, reservation) =>
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

  private async validateCartForCheckout(
    clientId: string,
    dto: CheckoutCartDto,
  ): Promise<ValidatedCheckoutCart> {
    return this.cartValidationService.validateCartForCheckout(clientId, dto);
  }

  private async resolveDeliveryAddresses(
    providerOrders: CheckoutProviderGroup[],
    dto: CheckoutCartDto,
    checkoutCity: ValidatedCheckoutCart['checkoutCity'],
  ): Promise<CheckoutDeliveryPlanningResult> {
    return this.deliveryPlanningService.resolveDeliveryPlan(
      providerOrders,
      dto,
      checkoutCity,
    );
  }

  private async createOrderWithSuborders(
    clientId: string,
    dto: CheckoutCartDto,
    cart: ValidatedCheckoutCart['cart'],
    providerOrders: CheckoutProviderGroup[],
    addresses: {
      geocodedAddress: GeocodedAddress;
      providerCoverageMap: Map<
        string,
        { providerId: string; distanceKm: number; coverageLimitKm: number }
      >;
      deliveryPricing: CheckoutDeliveryPlanningResult['deliveryPricing'];
    },
    totalPrice: number,
    normalizedKey: string,
  ): Promise<CheckoutOrderRecord> {
    return this.orderCreationService.createOrderWithSuborders(
      clientId,
      dto,
      cart,
      providerOrders,
      addresses,
      totalPrice,
      normalizedKey,
    );
  }

  private async initiatePaymentSession(
    order: CheckoutOrderRecord,
    _clientId: string,
  ): Promise<ReservationAwareOrder> {
    const orderWithReservations = await this.prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: checkoutOrderInclude,
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
    const existingOrder = await this.prisma.order.findUnique({
      where: {
        checkoutIdempotencyKey: normalizedKey,
      },
      include: checkoutOrderInclude,
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
    } catch (error: unknown) {
      if ((error as { code?: string }).code === 'P2002') {
        const duplicatedOrder = await this.prisma.order.findUnique({
          where: {
            checkoutIdempotencyKey: normalizedKey,
          },
          include: checkoutOrderInclude,
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
