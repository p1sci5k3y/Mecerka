import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { OrderStatusService } from './order-status.service';
import { OrderQueryService } from './order-query.service';
import { CheckoutCartDto } from '../cart/dto/checkout-cart.dto';
import { CreateOrderDto } from './dto/create-order.dto';
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
import { CheckoutService } from './checkout.service';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orderStatusService: OrderStatusService,
    private readonly orderQueryService: OrderQueryService,
    private readonly checkoutService: CheckoutService,
    @Inject(IOrderRepository)
    private readonly orderRepository: IOrderRepository,
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

  async getOrderTracking(id: string, userId: string, roles: Role[]) {
    return this.orderQueryService.getOrderTracking(id, userId, roles);
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
    return this.checkoutService.checkoutFromCart(clientId, dto, idempotencyKey);
  }

  async create(createOrderDto: CreateOrderDto, clientId: string) {
    const { items, deliveryAddress, pin, deliveryLat, deliveryLng } =
      createOrderDto;

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

    if (products.length !== productIds.length) {
      const foundIds = new Set(products.map((p) => p.id));
      const missingIds = productIds.filter((id) => !foundIds.has(id));
      throw new NotFoundException(
        `Algunos productos no existen: ${missingIds.join(', ')}`,
      );
    }

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

    const distinctCityIds = new Set(products.map((p) => p.cityId));
    if (distinctCityIds.size > 1) {
      throw new BadRequestException(
        'No se puede mezclar productos de distintas ciudades en un mismo pedido',
      );
    }
    const cityId = distinctCityIds.values().next().value as string;

    for (const item of aggregatedItems) {
      const product = products.find((p) => p.id === item.productId)!;
      if (product.stock < item.quantity) {
        throw new BadRequestException(
          `Stock insuficiente para el producto '${product.name}' (Solicitado: ${item.quantity}, Disponible: ${product.stock})`,
        );
      }
    }

    const providerGroups: Record<string, { items: any[]; subtotal: number }> =
      {};
    let orderTotalPrice = 0;

    for (const item of aggregatedItems) {
      const product = products.find((p) => p.id === item.productId)!;
      const providerId = product.providerId;
      const itemTotal = Number(product.price) * item.quantity;
      orderTotalPrice += itemTotal;
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
      providerGroups[providerId].subtotal += itemTotal;
    }

    if (Object.keys(providerGroups).length !== 1) {
      throw new BadRequestException(
        'El flujo de pago actual solo admite pedidos de un único proveedor.',
      );
    }

    const baseCityFee = 3.5;
    const multiStopPenalty = 1.5;
    const providerCount = Object.keys(providerGroups).length;
    const deliveryFee = baseCityFee + (providerCount - 1) * multiStopPenalty;

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
      { orderId: order.id },
      'Order created through legacy manual flow',
    );

    return order;
  }

  findAll(userId: string, roles: Role[]) {
    return this.orderQueryService.findAll(userId, roles);
  }

  async findOne(id: string, userId: string, roles: Role[]) {
    return this.orderQueryService.findOne(id, userId, roles);
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
    return this.orderQueryService.getAvailableOrders();
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
    return this.orderQueryService.getProviderStats(providerId);
  }

  async getProviderSalesChart(providerId: string) {
    return this.orderQueryService.getProviderSalesChart(providerId);
  }

  async getProviderTopProducts(providerId: string) {
    return this.orderQueryService.getProviderTopProducts(providerId);
  }
}
