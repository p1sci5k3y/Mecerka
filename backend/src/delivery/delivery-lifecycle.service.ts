import { Logger, NotFoundException } from '@nestjs/common';
import { DeliveryOrderStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConfirmDeliveryDto } from './dto/confirm-delivery.dto';
import { DeliveryDomainPolicy } from './delivery-domain-policy';

type StructuredLogger = (
  event: string,
  payload: Record<string, string | number | boolean | null | undefined>,
  message: string,
) => void;

export class DeliveryLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly domainPolicy: DeliveryDomainPolicy,
    private readonly logger: Logger,
    private readonly logStructuredEvent: StructuredLogger,
  ) {}

  async markPickupPending(
    deliveryOrderId: string,
    userId: string,
    roles: Role[],
  ) {
    return this.transitionDeliveryLifecycle(
      deliveryOrderId,
      userId,
      roles,
      DeliveryOrderStatus.PICKUP_PENDING,
    );
  }

  async confirmPickup(deliveryOrderId: string, userId: string, roles: Role[]) {
    return this.transitionDeliveryLifecycle(
      deliveryOrderId,
      userId,
      roles,
      DeliveryOrderStatus.PICKED_UP,
    );
  }

  async startTransit(deliveryOrderId: string, userId: string, roles: Role[]) {
    return this.transitionDeliveryLifecycle(
      deliveryOrderId,
      userId,
      roles,
      DeliveryOrderStatus.IN_TRANSIT,
    );
  }

  async confirmDelivery(
    deliveryOrderId: string,
    userId: string,
    roles: Role[],
    dto?: ConfirmDeliveryDto,
  ) {
    return this.transitionDeliveryLifecycle(
      deliveryOrderId,
      userId,
      roles,
      DeliveryOrderStatus.DELIVERED,
      dto,
    );
  }

  private async transitionDeliveryLifecycle(
    deliveryOrderId: string,
    userId: string,
    roles: Role[],
    nextStatus: DeliveryOrderStatus,
    options?: {
      deliveryProofUrl?: string;
      deliveryNotes?: string;
    },
  ) {
    const now = new Date();

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT 1 FROM "DeliveryOrder" WHERE "id" = ${deliveryOrderId}::uuid FOR UPDATE`,
      );

      const deliveryOrder = await tx.deliveryOrder.findUnique({
        where: { id: deliveryOrderId },
      });

      if (!deliveryOrder) {
        throw new NotFoundException('DeliveryOrder not found');
      }

      await this.domainPolicy.validateAssignedRunnerForLifecycle(
        tx,
        deliveryOrder,
        userId,
        roles,
      );

      if (deliveryOrder.status === nextStatus) {
        return deliveryOrder;
      }

      this.domainPolicy.validateLifecycleTransition(
        deliveryOrder.status,
        nextStatus,
      );

      const data: Record<string, unknown> = {
        status: nextStatus,
      };

      if (
        nextStatus === DeliveryOrderStatus.PICKED_UP &&
        deliveryOrder.pickupAt == null
      ) {
        data.pickupAt = now;
      }

      if (
        nextStatus === DeliveryOrderStatus.IN_TRANSIT &&
        deliveryOrder.transitAt == null
      ) {
        data.transitAt = now;
      }

      if (
        nextStatus === DeliveryOrderStatus.DELIVERED &&
        deliveryOrder.deliveredAt == null
      ) {
        data.deliveredAt = now;
      }

      if (nextStatus === DeliveryOrderStatus.DELIVERED) {
        if (options?.deliveryProofUrl) {
          data.deliveryProofUrl = options.deliveryProofUrl;
        }
        if (options?.deliveryNotes) {
          data.deliveryNotes = options.deliveryNotes;
        }
      }

      const updated = await tx.deliveryOrder.update({
        where: { id: deliveryOrderId },
        data,
      });

      this.logStructuredEvent(
        'delivery.state_transition',
        {
          orderId: deliveryOrder.orderId,
          runnerId: deliveryOrder.runnerId ?? userId,
        },
        `Delivery lifecycle transitioned from ${deliveryOrder.status} to ${nextStatus}`,
      );

      return updated;
    });
  }
}
