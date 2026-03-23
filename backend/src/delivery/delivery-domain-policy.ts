import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DeliveryOrderStatus, Prisma, Role } from '@prisma/client';
import {
  DeliveryIncidentStatusValue,
  DeliveryIncidentStatusValues,
  IncidentReporterRoleValue,
  IncidentReporterRoleValues,
} from './delivery-incident.constants';

type DeliveryJobListingInput = {
  id: string;
  deliveryOrderId: string;
  expiresAt: Date | null;
  deliveryOrder: {
    deliveryFee: Prisma.Decimal | number;
    order: {
      city: {
        name: string;
      };
    };
  };
};

type LifecycleRunnerValidatorClient = Pick<
  Prisma.TransactionClient,
  'runnerProfile'
>;

type DeliveryOrderLifecycleRecord = {
  runnerId: string | null;
};

type DeliveryTrackingRecord = {
  id: string;
  status: DeliveryOrderStatus;
  pickupAt: Date | null;
  transitAt: Date | null;
  deliveredAt: Date | null;
  lastLocationUpdateAt: Date | null;
  lastRunnerLocationLat: number | null;
  lastRunnerLocationLng: number | null;
  runnerId: string | null;
  order: {
    clientId: string;
  };
};

type IncidentOwnershipDeliveryOrder = {
  order: {
    clientId: string;
    providerOrders: Array<{
      providerId: string;
    }>;
  };
  runnerId: string | null;
};

type DeliveryIncidentReadRecord = {
  reporterId: string;
  deliveryOrder: IncidentOwnershipDeliveryOrder;
};

type DeliveryIncidentRecord = {
  id: string;
  deliveryOrderId: string;
  reporterRole: IncidentReporterRoleValue;
  type: string;
  status: DeliveryIncidentStatusValue;
  description: string;
  evidenceUrl: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
};

export class DeliveryDomainPolicy {
  buildJobListing(job: DeliveryJobListingInput) {
    return {
      jobId: job.id,
      deliveryOrderId: job.deliveryOrderId,
      pickupArea: job.deliveryOrder.order.city.name,
      deliveryArea: job.deliveryOrder.order.city.name,
      deliveryFee: job.deliveryOrder.deliveryFee,
      expiresAt: job.expiresAt,
    };
  }

  roundCoordinate(value: number) {
    return Number(value.toFixed(3));
  }

  calculateDistanceMeters(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ) {
    const earthRadiusMeters = 6371000;
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) *
        Math.cos(this.deg2rad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusMeters * c;
  }

  isTrackingActiveStatus(status: DeliveryOrderStatus) {
    return (
      status === DeliveryOrderStatus.PICKUP_PENDING ||
      status === DeliveryOrderStatus.PICKED_UP ||
      status === DeliveryOrderStatus.IN_TRANSIT
    );
  }

  canCustomerSeeTracking(status: DeliveryOrderStatus) {
    return (
      status === DeliveryOrderStatus.PICKED_UP ||
      status === DeliveryOrderStatus.IN_TRANSIT ||
      status === DeliveryOrderStatus.DELIVERED
    );
  }

  validateLifecycleTransition(
    currentStatus: DeliveryOrderStatus,
    nextStatus: DeliveryOrderStatus,
  ) {
    const allowedTransitions: Record<
      DeliveryOrderStatus,
      DeliveryOrderStatus[]
    > = {
      [DeliveryOrderStatus.PENDING]: [],
      [DeliveryOrderStatus.RUNNER_ASSIGNED]: [
        DeliveryOrderStatus.PICKUP_PENDING,
      ],
      [DeliveryOrderStatus.PICKUP_PENDING]: [DeliveryOrderStatus.PICKED_UP],
      [DeliveryOrderStatus.PICKED_UP]: [DeliveryOrderStatus.IN_TRANSIT],
      [DeliveryOrderStatus.IN_TRANSIT]: [DeliveryOrderStatus.DELIVERED],
      [DeliveryOrderStatus.DELIVERED]: [],
      [DeliveryOrderStatus.CANCELLED]: [],
    };

    if (currentStatus === nextStatus) {
      return;
    }

    if (!allowedTransitions[currentStatus]?.includes(nextStatus)) {
      throw new ConflictException(
        `Invalid delivery lifecycle transition from ${currentStatus} to ${nextStatus}`,
      );
    }
  }

  async validateAssignedRunnerForLifecycle(
    tx: LifecycleRunnerValidatorClient,
    deliveryOrder: DeliveryOrderLifecycleRecord,
    userId: string,
    roles: Role[],
  ) {
    if (roles.includes(Role.ADMIN)) {
      return;
    }

    if (!deliveryOrder.runnerId || deliveryOrder.runnerId !== userId) {
      throw new ForbiddenException(
        'Only the assigned runner can update this delivery lifecycle',
      );
    }

    const runner = await tx.runnerProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            active: true,
          },
        },
      },
    });

    if (!runner || !runner.isActive || !runner.user.active) {
      throw new ForbiddenException(
        'Runner is not active for lifecycle updates',
      );
    }
  }

  buildTrackingResponse(
    deliveryOrder: DeliveryTrackingRecord,
    userId: string,
    roles: Role[],
  ) {
    const base = {
      deliveryOrderId: deliveryOrder.id,
      status: deliveryOrder.status,
      pickupAt: deliveryOrder.pickupAt ?? null,
      transitAt: deliveryOrder.transitAt ?? null,
      deliveredAt: deliveryOrder.deliveredAt ?? null,
      lastLocationUpdateAt: deliveryOrder.lastLocationUpdateAt ?? null,
    };

    const currentLocation =
      deliveryOrder.lastRunnerLocationLat != null &&
      deliveryOrder.lastRunnerLocationLng != null
        ? {
            latitude: deliveryOrder.lastRunnerLocationLat,
            longitude: deliveryOrder.lastRunnerLocationLng,
          }
        : null;

    if (roles.includes(Role.ADMIN) || deliveryOrder.runnerId === userId) {
      return {
        ...base,
        currentLocation,
      };
    }

    if (
      deliveryOrder.order.clientId === userId &&
      this.canCustomerSeeTracking(deliveryOrder.status) &&
      currentLocation
    ) {
      return {
        ...base,
        currentLocation: {
          latitude: this.roundCoordinate(currentLocation.latitude),
          longitude: this.roundCoordinate(currentLocation.longitude),
        },
      };
    }

    return {
      ...base,
      currentLocation: null,
    };
  }

  assertTrackingReadAccess(
    deliveryOrder: DeliveryTrackingRecord,
    userId: string,
    roles: Role[],
  ) {
    if (roles.includes(Role.ADMIN)) {
      return;
    }

    if (deliveryOrder.runnerId && deliveryOrder.runnerId === userId) {
      return;
    }

    if (deliveryOrder.order.clientId === userId) {
      return;
    }

    throw new NotFoundException('DeliveryOrder not found');
  }

  validateIncidentTransition(
    currentStatus: DeliveryIncidentStatusValue,
    nextStatus: DeliveryIncidentStatusValue,
  ) {
    const allowedTransitions: Record<
      DeliveryIncidentStatusValue,
      DeliveryIncidentStatusValue[]
    > = {
      [DeliveryIncidentStatusValues.OPEN]: [
        DeliveryIncidentStatusValues.UNDER_REVIEW,
      ],
      [DeliveryIncidentStatusValues.UNDER_REVIEW]: [
        DeliveryIncidentStatusValues.RESOLVED,
        DeliveryIncidentStatusValues.REJECTED,
      ],
      [DeliveryIncidentStatusValues.RESOLVED]: [],
      [DeliveryIncidentStatusValues.REJECTED]: [],
    };

    if (currentStatus === nextStatus) {
      return;
    }

    if (!allowedTransitions[currentStatus]?.includes(nextStatus)) {
      throw new ConflictException(
        `Invalid incident transition from ${currentStatus} to ${nextStatus}`,
      );
    }
  }

  validateEvidenceUrl(evidenceUrl?: string) {
    if (!evidenceUrl) {
      return;
    }

    if (
      evidenceUrl.startsWith('data:') ||
      !evidenceUrl.startsWith('https://')
    ) {
      throw new BadRequestException('Incident evidenceUrl must use HTTPS');
    }
  }

  async resolveIncidentReporterRole(
    deliveryOrder: IncidentOwnershipDeliveryOrder,
    userId: string,
    roles: Role[],
  ): Promise<IncidentReporterRoleValue> {
    if (roles.includes(Role.ADMIN)) {
      return IncidentReporterRoleValues.ADMIN;
    }

    if (
      roles.includes(Role.CLIENT) &&
      deliveryOrder.order.clientId === userId
    ) {
      return IncidentReporterRoleValues.CLIENT;
    }

    if (roles.includes(Role.RUNNER) && deliveryOrder.runnerId === userId) {
      return IncidentReporterRoleValues.RUNNER;
    }

    if (
      roles.includes(Role.PROVIDER) &&
      deliveryOrder.order.providerOrders.some(
        (providerOrder: { providerId: string }) =>
          providerOrder.providerId === userId,
      )
    ) {
      return IncidentReporterRoleValues.PROVIDER;
    }

    throw new ForbiddenException(
      'You are not allowed to create incidents for this delivery order',
    );
  }

  async assertIncidentReadAccess(
    incident: DeliveryIncidentReadRecord,
    userId: string,
    roles: Role[],
  ) {
    if (roles.includes(Role.ADMIN) || incident.reporterId === userId) {
      return;
    }

    await this.resolveIncidentReporterRole(
      incident.deliveryOrder,
      userId,
      roles,
    );
  }

  sanitizeIncident(incident: DeliveryIncidentRecord) {
    return {
      id: incident.id,
      deliveryOrderId: incident.deliveryOrderId,
      reporterRole: incident.reporterRole,
      type: incident.type,
      status: incident.status,
      description: incident.description,
      evidenceUrl: incident.evidenceUrl ?? null,
      createdAt: incident.createdAt,
      resolvedAt: incident.resolvedAt ?? null,
    };
  }

  private deg2rad(deg: number) {
    return deg * (Math.PI / 180);
  }
}
