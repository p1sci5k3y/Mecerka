import { ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DeliveryDomainPolicy } from './delivery-domain-policy';
import { UpdateDeliveryLocationDto } from './dto/update-delivery-location.dto';

type DeliveryTrackingReadRecord = Prisma.DeliveryOrderGetPayload<{
  include: {
    order: {
      select: {
        clientId: true;
      };
    };
  };
}>;

type DeliveryLocationHistoryOrderRecord = Prisma.DeliveryOrderGetPayload<{
  select: {
    id: true;
    runnerId: true;
    createdAt: true;
    deliveredAt: true;
  };
}>;

export class DeliveryTrackingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly domainPolicy: DeliveryDomainPolicy,
    private readonly logger: Logger,
  ) {}

  async updateRunnerLocation(
    deliveryOrderId: string,
    userId: string,
    roles: Role[],
    dto: UpdateDeliveryLocationDto,
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

      if (!this.domainPolicy.isTrackingActiveStatus(deliveryOrder.status)) {
        throw new ConflictException(
          'Runner location updates are not allowed for the current delivery status',
        );
      }

      const latestRunnerLocation = await tx.runnerLocation.findFirst({
        where: {
          runnerId: userId,
        },
        orderBy: {
          recordedAt: 'desc',
        },
      });

      if (
        latestRunnerLocation?.recordedAt instanceof Date &&
        now.getTime() - latestRunnerLocation.recordedAt.getTime() <
          this.getLocationUpdateIntervalMs()
      ) {
        throw new ConflictException('Runner location updates are too frequent');
      }

      if (
        deliveryOrder.lastLocationUpdateAt instanceof Date &&
        now.getTime() - deliveryOrder.lastLocationUpdateAt.getTime() <
          this.getLocationUpdateIntervalMs() &&
        deliveryOrder.lastRunnerLocationLat != null &&
        deliveryOrder.lastRunnerLocationLng != null
      ) {
        const jumpMeters = this.domainPolicy.calculateDistanceMeters(
          deliveryOrder.lastRunnerLocationLat,
          deliveryOrder.lastRunnerLocationLng,
          dto.latitude,
          dto.longitude,
        );

        if (jumpMeters > this.getMaximumLocationJumpMeters()) {
          throw new ConflictException(
            'Runner location jump exceeds allowed threshold',
          );
        }
      }

      if (
        deliveryOrder.lastLocationUpdateAt instanceof Date &&
        now.getTime() - deliveryOrder.lastLocationUpdateAt.getTime() <
          this.getLocationUpdateIntervalMs()
      ) {
        throw new ConflictException('Runner location updates are too frequent');
      }

      await tx.runnerLocation.create({
        data: {
          runnerId: userId,
          latitude: dto.latitude,
          longitude: dto.longitude,
          recordedAt: now,
        },
      });

      const updated = await tx.deliveryOrder.update({
        where: { id: deliveryOrderId },
        data: {
          lastRunnerLocationLat: dto.latitude,
          lastRunnerLocationLng: dto.longitude,
          lastLocationUpdateAt: now,
        },
      });

      this.logStructuredEvent(
        'runner.location.updated',
        {
          orderId: updated.orderId,
          runnerId: userId,
        },
        'Runner location updated',
      );
      this.logStructuredEvent(
        deliveryOrder.lastLocationUpdateAt
          ? 'tracking.updated'
          : 'tracking.started',
        {
          orderId: updated.orderId,
          runnerId: userId,
        },
        'Delivery tracking heartbeat recorded',
      );

      return {
        deliveryOrderId: updated.id,
        lastLocationUpdateAt: updated.lastLocationUpdateAt,
      };
    });
  }

  async getDeliveryTracking(
    deliveryOrderId: string,
    userId: string,
    roles: Role[],
  ) {
    const deliveryOrder: DeliveryTrackingReadRecord | null =
      await this.prisma.deliveryOrder.findUnique({
        where: { id: deliveryOrderId },
        include: {
          order: {
            select: {
              clientId: true,
            },
          },
        },
      });

    if (!deliveryOrder) {
      throw new NotFoundException('DeliveryOrder not found');
    }

    this.domainPolicy.assertTrackingReadAccess(deliveryOrder, userId, roles);
    return this.domainPolicy.buildTrackingResponse(
      deliveryOrder,
      userId,
      roles,
    );
  }

  async getDeliveryLocationHistory(deliveryOrderId: string) {
    const now = new Date();
    const deliveryOrder: DeliveryLocationHistoryOrderRecord | null =
      await this.prisma.deliveryOrder.findUnique({
        where: { id: deliveryOrderId },
        select: {
          id: true,
          runnerId: true,
          createdAt: true,
          deliveredAt: true,
        },
      });

    if (!deliveryOrder) {
      throw new NotFoundException('DeliveryOrder not found');
    }

    if (!deliveryOrder.runnerId) {
      return [];
    }

    return this.prisma.runnerLocation.findMany({
      where: {
        runnerId: deliveryOrder.runnerId,
        recordedAt: {
          gte: deliveryOrder.createdAt,
          lte: deliveryOrder.deliveredAt ?? now,
        },
      },
      orderBy: {
        recordedAt: 'asc',
      },
    });
  }

  async cleanupRunnerLocations(now = new Date()) {
    const cutoff = new Date(now.getTime() - this.getLocationRetentionMs());
    const result = await this.prisma.runnerLocation.deleteMany({
      where: {
        recordedAt: {
          lt: cutoff,
        },
      },
    });

    this.logger.log(
      `tracking.cleanup deleted=${result.count} timestamp=${now.toISOString()}`,
    );

    return {
      deletedLocations: result.count,
    };
  }

  private getLocationUpdateIntervalMs() {
    const configured = Number(
      this.configService.get<string>('RUNNER_LOCATION_MIN_INTERVAL_MS') ??
        '3000',
    );
    return Number.isFinite(configured) && configured > 0 ? configured : 3000;
  }

  private getMaximumLocationJumpMeters() {
    const configured = Number(
      this.configService.get<string>('MAX_LOCATION_JUMP_METERS') ?? '5000',
    );
    return Number.isFinite(configured) && configured > 0 ? configured : 5000;
  }

  private getLocationRetentionMs() {
    const configured = Number(
      this.configService.get<string>('RUNNER_LOCATION_RETENTION_HOURS') ?? '24',
    );
    const hours =
      Number.isFinite(configured) && configured > 0 ? configured : 24;
    return hours * 60 * 60 * 1000;
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
}
