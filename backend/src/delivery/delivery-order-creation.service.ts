import {
  ConflictException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import {
  DeliveryOrderStatus,
  Prisma,
  Role,
  RunnerPaymentStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDeliveryOrderDto } from './dto/create-delivery-order.dto';
import { DeliveryDispatchService } from './delivery-dispatch.service';

@Injectable()
export class DeliveryOrderCreationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatchService: DeliveryDispatchService,
  ) {}

  private assertClientOrAdminAccess(
    clientId: string,
    userId: string,
    roles: Role[],
  ) {
    if (!roles.includes(Role.ADMIN) && clientId !== userId) {
      throw new ForbiddenException(
        'You do not have access to this delivery order',
      );
    }
  }

  async createDeliveryOrder(
    dto: CreateDeliveryOrderDto,
    userId: string,
    roles: Role[],
  ) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT 1 FROM "Order" WHERE "id" = ${dto.orderId}::uuid FOR UPDATE`,
      );

      const order = await tx.order.findUnique({
        where: { id: dto.orderId },
        select: {
          id: true,
          clientId: true,
          deliveryFee: true,
          deliveryOrder: {
            include: {
              order: {
                select: {
                  clientId: true,
                },
              },
            },
          },
        },
      });

      if (!order) {
        throw new NotFoundException('Order not found');
      }

      this.assertClientOrAdminAccess(order.clientId, userId, roles);

      if (order.deliveryOrder) {
        throw new ConflictException(
          'DeliveryOrder already exists for this order',
        );
      }

      const officialDeliveryFee = Number(order.deliveryFee ?? 0);
      if (Math.abs(officialDeliveryFee - dto.deliveryFee) > 0.009) {
        throw new ConflictException(
          'Delivery fee must match the official order delivery fee',
        );
      }

      const deliveryOrder = await tx.deliveryOrder.create({
        data: {
          orderId: dto.orderId,
          deliveryFee: officialDeliveryFee,
          currency: dto.currency,
          status: DeliveryOrderStatus.PENDING,
          paymentStatus: RunnerPaymentStatus.PENDING,
        },
        include: {
          order: {
            select: {
              clientId: true,
            },
          },
        },
      });

      await tx.order.update({
        where: { id: dto.orderId },
        data: {
          deliveryFee: officialDeliveryFee,
        },
      });

      await this.dispatchService.createInitialDeliveryJob(tx, deliveryOrder.id);

      return deliveryOrder;
    });
  }
}
