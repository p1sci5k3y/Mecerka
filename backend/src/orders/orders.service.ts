import {
  Inject,
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { OrderStatusService } from './order-status.service';
import { OrderQueryService } from './order-query.service';
import { CheckoutCartDto } from '../cart/dto/checkout-cart.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { PrismaService } from '../prisma/prisma.service';
import { IOrderRepository } from './repositories/order.repository.interface';
import {
  Role,
  ProviderOrderStatus,
  PaymentSessionStatus,
  ProviderPaymentStatus,
  Prisma,
} from '@prisma/client';
import { CheckoutService } from './checkout.service';
import { LegacyManualOrderCreationService } from './legacy-manual-order-creation.service';

@Injectable()
export class OrdersService {
  private readonly providerPaymentEligibleStatuses: ProviderOrderStatus[] = [
    ProviderOrderStatus.PENDING,
    ProviderOrderStatus.PAYMENT_PENDING,
    ProviderOrderStatus.PAYMENT_READY,
  ];
  private readonly expirableProviderOrderStatuses: ProviderOrderStatus[] = [
    ProviderOrderStatus.PENDING,
    ProviderOrderStatus.PAYMENT_PENDING,
    ProviderOrderStatus.PAYMENT_READY,
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly orderStatusService: OrderStatusService,
    private readonly orderQueryService: OrderQueryService,
    private readonly checkoutService: CheckoutService,
    private readonly legacyManualOrderCreationService: LegacyManualOrderCreationService,
    @Inject(IOrderRepository)
    private readonly orderRepository: IOrderRepository,
  ) {}

  private readonly providerPaymentProvider = 'internal-mvp';

  private buildProviderPaymentUrl(providerOrderId: string, sessionId: string) {
    return `/provider-orders/${providerOrderId}/payment-sessions/${sessionId}`;
  }

  async getOrderTracking(id: string, userId: string, roles: Role[]) {
    return this.orderQueryService.getOrderTracking(id, userId, roles);
  }

  async prepareProviderOrderPayment(providerOrderId: string) {
    const now = new Date();
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
        !this.providerPaymentEligibleStatuses.includes(providerOrder.status)
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
    const expiredReservations = await this.prisma.stockReservation.findMany({
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
        expiredReservations.map((reservation) => reservation.providerOrderId),
      ),
    ];

    const result = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const reservationResult = await tx.stockReservation.updateMany({
          where: {
            id: {
              in: expiredReservations.map((reservation) => reservation.id),
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
              in: this.expirableProviderOrderStatuses,
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
      },
    );

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
    return this.legacyManualOrderCreationService.create(
      createOrderDto,
      clientId,
    );
  }

  findAll(userId: string, roles: Role[]) {
    return this.orderQueryService.findAll(userId, roles);
  }

  async findOne(id: string, userId: string, roles: Role[]) {
    return this.orderQueryService.findOne(id, userId, roles);
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
