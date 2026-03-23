import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeliveryOrderStatus,
  DeliveryJobStatus,
  PaymentAccountOwnerType,
  PaymentAccountProvider,
  PaymentSessionStatus,
  Prisma,
  RiskActorType,
  RiskCategory,
  Role,
  RunnerPaymentStatus,
} from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { RiskService } from '../risk/risk.service';
import { AssignDeliveryRunnerDto } from './dto/assign-delivery-runner.dto';
import { ConfirmDeliveryDto } from './dto/confirm-delivery.dto';
import {
  DeliveryIncidentStatusValue,
  DeliveryIncidentStatusValues,
  IncidentReporterRoleValue,
  IncidentReporterRoleValues,
} from './delivery-incident.constants';
import { CreateDeliveryIncidentDto } from './dto/create-delivery-incident.dto';
import { CreateDeliveryOrderDto } from './dto/create-delivery-order.dto';
import { UpdateDeliveryLocationDto } from './dto/update-delivery-location.dto';

@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);
  private stripe: Stripe | null = null;
  private static readonly WEBHOOK_STATUS_RECEIVED = 'RECEIVED';
  private static readonly WEBHOOK_STATUS_PROCESSED = 'PROCESSED';
  private static readonly WEBHOOK_STATUS_IGNORED = 'IGNORED';
  private static readonly WEBHOOK_STATUS_FAILED = 'FAILED';
  private static readonly DEMO_RUNNER_PAYMENT_UNAVAILABLE_MESSAGE =
    'Este entorno demo no puede preparar el pago Stripe del reparto. El importe y el estado del reparto siguen siendo válidos, pero el cobro requiere credenciales Stripe operativas.';

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Optional() private readonly riskService?: RiskService,
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

  private getJobGrabbingWindowMs() {
    return 5 * 60 * 1000;
  }

  private getJobGrabbingThreshold() {
    return 5;
  }

  private buildWindowKey(now: Date, windowMs: number) {
    return Math.floor(now.getTime() / windowMs).toString();
  }

  private async emitRiskEvent(
    actorType: RiskActorType,
    actorId: string,
    category: RiskCategory,
    score: number,
    dedupKey: string,
    metadata?: Record<string, string | number | boolean>,
  ) {
    if (!this.riskService) {
      return;
    }

    try {
      await this.riskService.recordRiskEvent({
        actorType,
        actorId,
        category,
        score,
        dedupKey,
        metadata,
      });
      await this.riskService.recalculateRiskScore(actorType, actorId);
    } catch (error: unknown) {
      this.logger.warn(
        `risk.delivery.integration_failed actorType=${actorType} actorId=${actorId} category=${category} message=${(error as Error).message}`,
      );
    }
  }

  private getDispatchWindowMs() {
    const configured = Number(
      this.configService.get<string>('DELIVERY_JOB_WINDOW_MINUTES') ?? '5',
    );
    const minutes =
      Number.isFinite(configured) && configured > 0 ? configured : 5;
    return minutes * 60 * 1000;
  }

  private getLocationUpdateIntervalMs() {
    const configured = Number(
      this.configService.get<string>('RUNNER_LOCATION_MIN_INTERVAL_MS') ??
        '3000',
    );
    return Number.isFinite(configured) && configured > 0 ? configured : 3000;
  }

  private getIncidentDailyLimit() {
    return 10;
  }

  private getIncidentPerDeliveryLimit() {
    return 3;
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

  private buildJobListing(job: any) {
    return {
      jobId: job.id,
      deliveryOrderId: job.deliveryOrderId,
      pickupArea: job.deliveryOrder.order.city.name,
      deliveryArea: job.deliveryOrder.order.city.name,
      deliveryFee: job.deliveryOrder.deliveryFee,
      expiresAt: job.expiresAt,
    };
  }

  private roundCoordinate(value: number) {
    return Number(value.toFixed(3));
  }

  private calculateDistanceMeters(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ) {
    const R = 6371000;
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

  private isTrackingActiveStatus(status: DeliveryOrderStatus) {
    return (
      status === DeliveryOrderStatus.PICKUP_PENDING ||
      status === DeliveryOrderStatus.PICKED_UP ||
      status === DeliveryOrderStatus.IN_TRANSIT
    );
  }

  private canCustomerSeeTracking(status: DeliveryOrderStatus) {
    return (
      status === DeliveryOrderStatus.PICKED_UP ||
      status === DeliveryOrderStatus.IN_TRANSIT ||
      status === DeliveryOrderStatus.DELIVERED
    );
  }

  private validateLifecycleTransition(
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

  private async validateAssignedRunnerForLifecycle(
    tx: any,
    deliveryOrder: any,
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

  private buildTrackingResponse(
    deliveryOrder: any,
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

    if (roles.includes(Role.ADMIN)) {
      return {
        ...base,
        currentLocation:
          deliveryOrder.lastRunnerLocationLat != null &&
          deliveryOrder.lastRunnerLocationLng != null
            ? {
                latitude: deliveryOrder.lastRunnerLocationLat,
                longitude: deliveryOrder.lastRunnerLocationLng,
              }
            : null,
      };
    }

    if (deliveryOrder.runnerId === userId) {
      return {
        ...base,
        currentLocation:
          deliveryOrder.lastRunnerLocationLat != null &&
          deliveryOrder.lastRunnerLocationLng != null
            ? {
                latitude: deliveryOrder.lastRunnerLocationLat,
                longitude: deliveryOrder.lastRunnerLocationLng,
              }
            : null,
      };
    }

    if (
      deliveryOrder.order.clientId === userId &&
      this.canCustomerSeeTracking(deliveryOrder.status) &&
      deliveryOrder.lastRunnerLocationLat != null &&
      deliveryOrder.lastRunnerLocationLng != null
    ) {
      return {
        ...base,
        currentLocation: {
          latitude: this.roundCoordinate(deliveryOrder.lastRunnerLocationLat),
          longitude: this.roundCoordinate(deliveryOrder.lastRunnerLocationLng),
        },
      };
    }

    return {
      ...base,
      currentLocation: null,
    };
  }

  private assertTrackingReadAccess(
    deliveryOrder: any,
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

  private validateIncidentTransition(
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

  private validateEvidenceUrl(evidenceUrl?: string) {
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

  private async resolveIncidentReporterRole(
    deliveryOrder: any,
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

  private async assertIncidentReadAccess(
    incident: any,
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

  private sanitizeIncident(incident: any) {
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

  private async transitionIncidentStatus(
    incidentId: string,
    actorId: string,
    nextStatus: DeliveryIncidentStatusValue,
  ) {
    const now = new Date();

    return this.prisma.$transaction(async (tx: any) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT 1 FROM "DeliveryIncident" WHERE "id" = ${incidentId}::uuid FOR UPDATE`,
      );

      const incident = await tx.deliveryIncident.findUnique({
        where: { id: incidentId },
      });

      if (!incident) {
        throw new NotFoundException('Delivery incident not found');
      }

      if (incident.status === nextStatus) {
        return this.sanitizeIncident(incident);
      }

      this.validateIncidentTransition(incident.status, nextStatus);

      const updated = await tx.deliveryIncident.update({
        where: { id: incidentId },
        data: {
          status: nextStatus,
          ...(nextStatus === DeliveryIncidentStatusValues.RESOLVED &&
          incident.resolvedAt == null
            ? { resolvedAt: now }
            : {}),
        },
      });

      const eventName =
        nextStatus === DeliveryIncidentStatusValues.UNDER_REVIEW
          ? 'incident.review_started'
          : nextStatus === DeliveryIncidentStatusValues.RESOLVED
            ? 'incident.resolved'
            : 'incident.rejected';

      this.logger.log(
        `${eventName} incident=${updated.id} deliveryOrder=${updated.deliveryOrderId} actor=${actorId} timestamp=${now.toISOString()}`,
      );

      return this.sanitizeIncident(updated);
    });
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

    return this.prisma.$transaction(async (tx: any) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT 1 FROM "DeliveryOrder" WHERE "id" = ${deliveryOrderId}::uuid FOR UPDATE`,
      );

      const deliveryOrder = await tx.deliveryOrder.findUnique({
        where: { id: deliveryOrderId },
      });

      if (!deliveryOrder) {
        throw new NotFoundException('DeliveryOrder not found');
      }

      await this.validateAssignedRunnerForLifecycle(
        tx,
        deliveryOrder,
        userId,
        roles,
      );

      if (deliveryOrder.status === nextStatus) {
        return deliveryOrder;
      }

      this.validateLifecycleTransition(deliveryOrder.status, nextStatus);

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

  private async createDeliveryJobRecord(tx: any, deliveryOrderId: string) {
    return tx.deliveryJob.create({
      data: {
        deliveryOrderId,
        status: DeliveryJobStatus.OPEN,
        expiresAt: new Date(Date.now() + this.getDispatchWindowMs()),
      },
    });
  }

  private getStripeClient() {
    if (this.stripe) {
      return this.stripe;
    }

    const demoMode = this.configService.get<string>('DEMO_MODE') === 'true';
    const stripeSecretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (
      !stripeSecretKey ||
      (demoMode && stripeSecretKey.trim().includes('dummy'))
    ) {
      throw new ConflictException(
        demoMode
          ? DeliveryService.DEMO_RUNNER_PAYMENT_UNAVAILABLE_MESSAGE
          : 'Stripe is not configured for delivery payments',
      );
    }

    this.stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2026-02-25.clover',
    });

    return this.stripe;
  }

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

  private assertDeliveryReadAccess(
    deliveryOrder: any,
    userId: string,
    roles: Role[],
  ) {
    if (roles.includes(Role.ADMIN)) {
      return;
    }

    if (deliveryOrder.order.clientId === userId) {
      return;
    }

    if (deliveryOrder.runnerId && deliveryOrder.runnerId === userId) {
      return;
    }

    throw new ForbiddenException(
      'You do not have access to this delivery order',
    );
  }

  private async resolveActiveRunnerStripePaymentAccount(runnerId: string) {
    const existing = await this.prisma.paymentAccount.findFirst({
      where: {
        ownerType: PaymentAccountOwnerType.RUNNER,
        ownerId: runnerId,
        provider: PaymentAccountProvider.STRIPE,
        isActive: true,
      },
    });

    if (existing) {
      return existing;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: runnerId },
      select: { stripeAccountId: true },
    });

    if (!user?.stripeAccountId) {
      return null;
    }

    return this.prisma.paymentAccount.upsert({
      where: {
        ownerType_ownerId_provider: {
          ownerType: PaymentAccountOwnerType.RUNNER,
          ownerId: runnerId,
          provider: PaymentAccountProvider.STRIPE,
        },
      },
      update: {
        externalAccountId: user.stripeAccountId,
        isActive: true,
      },
      create: {
        ownerType: PaymentAccountOwnerType.RUNNER,
        ownerId: runnerId,
        provider: PaymentAccountProvider.STRIPE,
        externalAccountId: user.stripeAccountId,
        isActive: true,
      },
    });
  }

  private async claimRunnerWebhookEvent(eventId: string, eventType: string) {
    try {
      await (this.prisma as any).runnerWebhookEvent.create({
        data: {
          id: eventId,
          provider: PaymentAccountProvider.STRIPE,
          eventType,
          status: DeliveryService.WEBHOOK_STATUS_RECEIVED,
        },
      });
      return true;
    } catch (error: unknown) {
      if ((error as { code?: string }).code === 'P2002') {
        return false;
      }
      throw error;
    }
  }

  private async markRunnerWebhookEventStatus(
    eventId: string,
    status: string,
    processedAt?: Date,
  ) {
    await (this.prisma as any).runnerWebhookEvent.update({
      where: { id: eventId },
      data: {
        status,
        ...(processedAt ? { processedAt } : {}),
      },
    });
  }

  async createDeliveryOrder(
    dto: CreateDeliveryOrderDto,
    userId: string,
    roles: Role[],
  ) {
    return this.prisma.$transaction(async (tx: any) => {
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

      await this.createDeliveryJobRecord(tx, deliveryOrder.id);

      return deliveryOrder;
    });
  }

  async createDeliveryJob(deliveryOrderId: string) {
    return this.prisma.$transaction(async (tx: any) => {
      const deliveryOrder = await tx.deliveryOrder.findUnique({
        where: { id: deliveryOrderId },
        select: {
          id: true,
          job: {
            select: {
              id: true,
            },
          },
        },
      });

      if (!deliveryOrder) {
        throw new NotFoundException('DeliveryOrder not found');
      }

      if (deliveryOrder.job) {
        return deliveryOrder.job;
      }

      return this.createDeliveryJobRecord(tx, deliveryOrderId);
    });
  }

  async assignRunner(
    deliveryOrderId: string,
    dto: AssignDeliveryRunnerDto,
    userId: string,
    roles: Role[],
  ) {
    return this.prisma.$transaction(async (tx: any) => {
      const deliveryOrder = await tx.deliveryOrder.findUnique({
        where: { id: deliveryOrderId },
        include: {
          order: {
            select: {
              id: true,
              clientId: true,
            },
          },
        },
      });

      if (!deliveryOrder) {
        throw new NotFoundException('DeliveryOrder not found');
      }

      this.assertClientOrAdminAccess(
        deliveryOrder.order.clientId,
        userId,
        roles,
      );

      if (
        ![
          DeliveryOrderStatus.PENDING,
          DeliveryOrderStatus.RUNNER_ASSIGNED,
        ].includes(deliveryOrder.status)
      ) {
        throw new ConflictException('DeliveryOrder is not assignable');
      }

      const runner = await tx.runnerProfile.findUnique({
        where: { userId: dto.runnerId },
        include: {
          user: {
            select: {
              id: true,
              active: true,
              stripeAccountId: true,
            },
          },
        },
      });

      if (!runner) {
        throw new NotFoundException('Runner not found');
      }

      if (!runner.isActive || !runner.user.active) {
        throw new BadRequestException('Runner is not active');
      }

      const paymentAccount = await this.resolveActiveRunnerStripePaymentAccount(
        dto.runnerId,
      );
      if (!paymentAccount?.isActive) {
        throw new BadRequestException(
          'Runner must complete payment onboarding before assignment.',
        );
      }

      const updated = await tx.deliveryOrder.update({
        where: { id: deliveryOrderId },
        data: {
          runnerId: dto.runnerId,
          status: DeliveryOrderStatus.RUNNER_ASSIGNED,
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
        where: { id: deliveryOrder.order.id },
        data: {
          runnerId: dto.runnerId,
        },
      });

      this.logStructuredEvent(
        'delivery.assignment',
        {
          orderId: deliveryOrder.order.id,
          runnerId: dto.runnerId,
        },
        'Delivery runner assigned',
      );

      return updated;
    });
  }

  async prepareRunnerPayment(
    deliveryOrderId: string,
    userId: string,
    roles: Role[],
  ) {
    const now = new Date();
    const stripe = this.getStripeClient();

    return this.prisma.$transaction(async (tx: any) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT 1 FROM "DeliveryOrder" WHERE "id" = ${deliveryOrderId}::uuid FOR UPDATE`,
      );

      const deliveryOrder = await tx.deliveryOrder.findUnique({
        where: { id: deliveryOrderId },
        include: {
          order: {
            select: {
              id: true,
              clientId: true,
            },
          },
          paymentSessions: {
            where: {
              status: {
                in: [PaymentSessionStatus.CREATED, PaymentSessionStatus.READY],
              },
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!deliveryOrder) {
        throw new NotFoundException('DeliveryOrder not found');
      }

      this.assertClientOrAdminAccess(
        deliveryOrder.order.clientId,
        userId,
        roles,
      );

      if (!deliveryOrder.runnerId) {
        throw new ConflictException(
          'DeliveryOrder does not have an assigned runner',
        );
      }

      if (
        ![
          DeliveryOrderStatus.RUNNER_ASSIGNED,
          DeliveryOrderStatus.PICKUP_PENDING,
        ].includes(deliveryOrder.status)
      ) {
        throw new ConflictException(
          'DeliveryOrder is not eligible for payment preparation',
        );
      }

      if (deliveryOrder.paymentStatus === RunnerPaymentStatus.PAID) {
        throw new ConflictException('DeliveryOrder is already paid');
      }

      const paymentAccount = await this.resolveActiveRunnerStripePaymentAccount(
        deliveryOrder.runnerId,
      );
      if (!paymentAccount?.isActive) {
        throw new ConflictException(
          'Runner payment account is not active for this delivery order',
        );
      }

      const expiredSessionIds = deliveryOrder.paymentSessions
        .filter(
          (session: any) =>
            session.expiresAt && session.expiresAt.getTime() <= now.getTime(),
        )
        .map((session: any) => session.id);

      if (expiredSessionIds.length > 0) {
        await tx.runnerPaymentSession.updateMany({
          where: {
            id: { in: expiredSessionIds },
            status: {
              in: [PaymentSessionStatus.CREATED, PaymentSessionStatus.READY],
            },
          },
          data: {
            status: PaymentSessionStatus.EXPIRED,
          },
        });
      }

      const activeSession = deliveryOrder.paymentSessions.find(
        (session: any) =>
          session.status === PaymentSessionStatus.READY &&
          session.externalSessionId &&
          (!session.expiresAt || session.expiresAt.getTime() > now.getTime()),
      );

      if (activeSession) {
        const existingIntent = await stripe.paymentIntents.retrieve(
          activeSession.externalSessionId,
          {
            stripeAccount: paymentAccount.externalAccountId,
          },
        );

        await tx.deliveryOrder.update({
          where: { id: deliveryOrderId },
          data: {
            paymentStatus: RunnerPaymentStatus.PAYMENT_READY,
          },
        });

        return {
          deliveryOrderId: deliveryOrder.id,
          runnerPaymentSessionId: activeSession.id,
          externalSessionId: activeSession.externalSessionId,
          clientSecret: existingIntent.client_secret,
          stripeAccountId: paymentAccount.externalAccountId,
          expiresAt: activeSession.expiresAt,
          paymentStatus: RunnerPaymentStatus.PAYMENT_READY,
        };
      }

      const intent = await stripe.paymentIntents.create(
        {
          amount: Math.round(Number(deliveryOrder.deliveryFee) * 100),
          currency: deliveryOrder.currency.toLowerCase(),
          automatic_payment_methods: { enabled: true },
          metadata: {
            orderId: deliveryOrder.order.id,
            deliveryOrderId: deliveryOrder.id,
            runnerId: deliveryOrder.runnerId,
          },
        },
        {
          stripeAccount: paymentAccount.externalAccountId,
        },
      );

      const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);
      const session = await tx.runnerPaymentSession.create({
        data: {
          deliveryOrderId: deliveryOrder.id,
          paymentProvider: PaymentAccountProvider.STRIPE,
          externalSessionId: intent.id,
          paymentUrl: null,
          status: PaymentSessionStatus.READY,
          expiresAt,
          providerMetadata: {
            stripeAccountId: paymentAccount.externalAccountId,
            paymentIntentId: intent.id,
            livemode: Boolean((intent as any).livemode ?? false),
          },
        },
      });

      await tx.deliveryOrder.update({
        where: { id: deliveryOrderId },
        data: {
          paymentStatus: RunnerPaymentStatus.PAYMENT_READY,
        },
      });

      return {
        deliveryOrderId: deliveryOrder.id,
        runnerPaymentSessionId: session.id,
        externalSessionId: intent.id,
        clientSecret: intent.client_secret,
        stripeAccountId: paymentAccount.externalAccountId,
        expiresAt,
        paymentStatus: RunnerPaymentStatus.PAYMENT_READY,
      };
    });
  }

  async confirmRunnerPayment(externalSessionId: string, eventId?: string) {
    if (eventId) {
      const claimed = await this.claimRunnerWebhookEvent(
        eventId,
        'payment_intent.succeeded',
      );
      if (!claimed) {
        return { message: 'Runner webhook already processed' };
      }
    }

    try {
      const result = await this.prisma.$transaction(async (tx: any) => {
        const session = await tx.runnerPaymentSession.findUnique({
          where: { externalSessionId },
          include: {
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

        if (!session) {
          throw new NotFoundException('Runner payment session not found');
        }

        if (
          session.status === PaymentSessionStatus.COMPLETED ||
          session.deliveryOrder.paymentStatus === RunnerPaymentStatus.PAID
        ) {
          return {
            deliveryOrderId: session.deliveryOrderId,
            status: session.deliveryOrder.status,
            paymentStatus: RunnerPaymentStatus.PAID,
          };
        }

        await tx.runnerPaymentSession.update({
          where: { id: session.id },
          data: { status: PaymentSessionStatus.COMPLETED },
        });

        const nextStatus =
          session.deliveryOrder.status === DeliveryOrderStatus.PENDING ||
          session.deliveryOrder.status === DeliveryOrderStatus.RUNNER_ASSIGNED
            ? DeliveryOrderStatus.PICKUP_PENDING
            : session.deliveryOrder.status;

        await tx.deliveryOrder.update({
          where: { id: session.deliveryOrderId },
          data: {
            paymentStatus: RunnerPaymentStatus.PAID,
            status: nextStatus,
            paymentRef: externalSessionId,
            paidAt: new Date(),
          },
        });

        return {
          deliveryOrderId: session.deliveryOrderId,
          status: nextStatus,
          paymentStatus: RunnerPaymentStatus.PAID,
        };
      });

      if (eventId) {
        await this.markRunnerWebhookEventStatus(
          eventId,
          'message' in result
            ? DeliveryService.WEBHOOK_STATUS_IGNORED
            : DeliveryService.WEBHOOK_STATUS_PROCESSED,
          new Date(),
        );
      }

      return result;
    } catch (error) {
      if (eventId) {
        await this.markRunnerWebhookEventStatus(
          eventId,
          DeliveryService.WEBHOOK_STATUS_FAILED,
          new Date(),
        );
      }
      throw error;
    }
  }

  async failRunnerPayment(externalSessionId: string, eventId?: string) {
    if (eventId) {
      const claimed = await this.claimRunnerWebhookEvent(
        eventId,
        'payment_intent.payment_failed',
      );
      if (!claimed) {
        return { message: 'Runner webhook already processed' };
      }
    }

    try {
      const result = await this.prisma.$transaction(async (tx: any) => {
        const session = await tx.runnerPaymentSession.findUnique({
          where: { externalSessionId },
          include: {
            deliveryOrder: true,
          },
        });

        if (!session) {
          throw new NotFoundException('Runner payment session not found');
        }

        if (session.status === PaymentSessionStatus.COMPLETED) {
          return {
            deliveryOrderId: session.deliveryOrderId,
            status: session.deliveryOrder.status,
            paymentStatus: RunnerPaymentStatus.PAID,
          };
        }

        await tx.runnerPaymentSession.update({
          where: { id: session.id },
          data: { status: PaymentSessionStatus.FAILED },
        });

        await tx.deliveryOrder.update({
          where: { id: session.deliveryOrderId },
          data: {
            paymentStatus: RunnerPaymentStatus.FAILED,
          },
        });

        return {
          deliveryOrderId: session.deliveryOrderId,
          status: session.deliveryOrder.status,
          paymentStatus: RunnerPaymentStatus.FAILED,
          clientId: session.deliveryOrder.order.clientId,
        };
      });

      if (eventId) {
        await this.markRunnerWebhookEventStatus(
          eventId,
          'message' in result
            ? DeliveryService.WEBHOOK_STATUS_IGNORED
            : DeliveryService.WEBHOOK_STATUS_PROCESSED,
          new Date(),
        );
      }

      if ('clientId' in result && result.clientId) {
        await this.emitRiskEvent(
          RiskActorType.CLIENT,
          result.clientId,
          RiskCategory.PAYMENT_FAILURE_PATTERN,
          10,
          `runner-payment-failed:${result.deliveryOrderId}`,
          {
            deliveryOrderId: result.deliveryOrderId,
          },
        );
      }

      return result;
    } catch (error) {
      if (eventId) {
        await this.markRunnerWebhookEventStatus(
          eventId,
          DeliveryService.WEBHOOK_STATUS_FAILED,
          new Date(),
        );
      }
      throw error;
    }
  }

  async getDeliveryOrder(
    deliveryOrderId: string,
    userId: string,
    roles: Role[],
  ) {
    const deliveryOrder = await (this.prisma as any).deliveryOrder.findUnique({
      where: { id: deliveryOrderId },
      include: {
        order: {
          select: {
            clientId: true,
          },
        },
        paymentSessions: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!deliveryOrder) {
      throw new NotFoundException('DeliveryOrder not found');
    }

    this.assertDeliveryReadAccess(deliveryOrder, userId, roles);
    return deliveryOrder;
  }

  async listAvailableJobs(runnerId?: string) {
    const now = new Date();
    const jobs = await (this.prisma as any).deliveryJob.findMany({
      where: {
        status: DeliveryJobStatus.OPEN,
        expiresAt: {
          gt: now,
        },
      },
      include: {
        deliveryOrder: {
          include: {
            order: {
              select: {
                city: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
        claims: runnerId
          ? {
              where: {
                runnerId,
              },
              select: {
                id: true,
              },
            }
          : false,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return jobs
      .filter((job: any) => !runnerId || job.claims.length === 0)
      .map((job: any) => this.buildJobListing(job));
  }

  async acceptDeliveryJob(jobId: string, runnerId: string) {
    const now = new Date();

    const result = await this.prisma.$transaction(async (tx: any) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT 1 FROM "DeliveryJob" WHERE "id" = ${jobId}::uuid FOR UPDATE`,
      );

      const job = await tx.deliveryJob.findUnique({
        where: { id: jobId },
        include: {
          deliveryOrder: {
            include: {
              order: {
                select: {
                  id: true,
                },
              },
            },
          },
        },
      });

      if (!job) {
        throw new NotFoundException('Delivery job not found');
      }

      const existingClaim = await tx.deliveryJobClaim.findUnique({
        where: {
          jobId_runnerId: {
            jobId,
            runnerId,
          },
        },
      });

      if (existingClaim) {
        throw new ConflictException(
          'Runner has already attempted to accept this job',
        );
      }

      if (job.status !== DeliveryJobStatus.OPEN) {
        throw new ConflictException('Delivery job is no longer available');
      }

      if (job.expiresAt && job.expiresAt.getTime() <= now.getTime()) {
        await tx.deliveryJob.update({
          where: { id: jobId },
          data: {
            status: DeliveryJobStatus.EXPIRED,
          },
        });
        throw new ConflictException('Delivery job has expired');
      }

      const runner = await tx.runnerProfile.findUnique({
        where: { userId: runnerId },
        include: {
          user: {
            select: {
              id: true,
              active: true,
              stripeAccountId: true,
            },
          },
        },
      });

      if (!runner || !runner.isActive || !runner.user.active) {
        throw new BadRequestException(
          'Runner is not eligible to accept delivery jobs',
        );
      }

      const paymentAccount =
        await this.resolveActiveRunnerStripePaymentAccount(runnerId);
      if (!paymentAccount?.isActive) {
        throw new BadRequestException(
          'Runner must complete payment onboarding before accepting delivery jobs.',
        );
      }

      await tx.deliveryJobClaim.create({
        data: {
          jobId,
          runnerId,
        },
      });

      await tx.deliveryJob.update({
        where: { id: jobId },
        data: {
          status: DeliveryJobStatus.ASSIGNED,
        },
      });

      const deliveryOrder = await tx.deliveryOrder.update({
        where: { id: job.deliveryOrderId },
        data: {
          runnerId,
          status: DeliveryOrderStatus.RUNNER_ASSIGNED,
        },
      });

      await tx.order.update({
        where: { id: job.deliveryOrder.order.id },
        data: {
          runnerId,
        },
      });

      return {
        jobId,
        deliveryOrderId: deliveryOrder.id,
        runnerId,
        status: DeliveryJobStatus.ASSIGNED,
      };
    });

    const windowMs = this.getJobGrabbingWindowMs();
    this.logStructuredEvent(
      'delivery.assignment',
      {
        orderId: result.deliveryOrderId,
        runnerId,
      },
      'Delivery job accepted by runner',
    );
    const deliveryJobClaimClient = (this.prisma as any).deliveryJobClaim;
    const recentClaims =
      typeof deliveryJobClaimClient?.count === 'function'
        ? await deliveryJobClaimClient.count({
            where: {
              runnerId,
              createdAt: {
                gte: new Date(now.getTime() - windowMs),
              },
            },
          })
        : 0;

    if (recentClaims >= this.getJobGrabbingThreshold()) {
      const windowKey = this.buildWindowKey(now, windowMs);
      await this.emitRiskEvent(
        RiskActorType.RUNNER,
        runnerId,
        RiskCategory.RUNNER_JOB_GRABBING,
        Math.min(recentClaims * 3, 20),
        `job-grabbing:${runnerId}:${windowKey}`,
        {
          deliveryOrderId: result.deliveryOrderId,
          claimCount: recentClaims,
          windowKey,
        },
      );
    }

    return result;
  }

  async expireDeliveryJobs(now = new Date()) {
    const result = await (this.prisma as any).deliveryJob.updateMany({
      where: {
        status: DeliveryJobStatus.OPEN,
        expiresAt: {
          lt: now,
        },
      },
      data: {
        status: DeliveryJobStatus.EXPIRED,
      },
    });

    return {
      expiredJobs: result.count,
    };
  }

  async updateRunnerLocation(
    deliveryOrderId: string,
    userId: string,
    roles: Role[],
    dto: UpdateDeliveryLocationDto,
  ) {
    const now = new Date();

    try {
      return await this.prisma.$transaction(async (tx: any) => {
        await tx.$executeRaw(
          Prisma.sql`SELECT 1 FROM "DeliveryOrder" WHERE "id" = ${deliveryOrderId}::uuid FOR UPDATE`,
        );

        const deliveryOrder = await tx.deliveryOrder.findUnique({
          where: { id: deliveryOrderId },
        });

        if (!deliveryOrder) {
          throw new NotFoundException('DeliveryOrder not found');
        }

        await this.validateAssignedRunnerForLifecycle(
          tx,
          deliveryOrder,
          userId,
          roles,
        );

        if (!this.isTrackingActiveStatus(deliveryOrder.status)) {
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
          throw new ConflictException(
            'Runner location updates are too frequent',
          );
        }

        if (
          deliveryOrder.lastLocationUpdateAt instanceof Date &&
          now.getTime() - deliveryOrder.lastLocationUpdateAt.getTime() <
            this.getLocationUpdateIntervalMs() &&
          deliveryOrder.lastRunnerLocationLat != null &&
          deliveryOrder.lastRunnerLocationLng != null
        ) {
          const jumpMeters = this.calculateDistanceMeters(
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
          throw new ConflictException(
            'Runner location updates are too frequent',
          );
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
    } catch (error: unknown) {
      if (
        error instanceof ConflictException &&
        error.message === 'Runner location jump exceeds allowed threshold'
      ) {
        await this.emitRiskEvent(
          RiskActorType.RUNNER,
          userId,
          RiskCategory.RUNNER_GPS_ANOMALY,
          20,
          `gps-anomaly:${deliveryOrderId}`,
          {
            deliveryOrderId,
          },
        );
      }

      throw error;
    }
  }

  async getDeliveryTracking(
    deliveryOrderId: string,
    userId: string,
    roles: Role[],
  ) {
    const deliveryOrder = await (this.prisma as any).deliveryOrder.findUnique({
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

    this.assertTrackingReadAccess(deliveryOrder, userId, roles);
    return this.buildTrackingResponse(deliveryOrder, userId, roles);
  }

  async getDeliveryLocationHistory(deliveryOrderId: string) {
    const now = new Date();
    const deliveryOrder = await (this.prisma as any).deliveryOrder.findUnique({
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

    return (this.prisma as any).runnerLocation.findMany({
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
    const result = await (this.prisma as any).runnerLocation.deleteMany({
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

  async createIncident(
    dto: CreateDeliveryIncidentDto,
    userId: string,
    roles: Role[],
  ) {
    this.validateEvidenceUrl(dto.evidenceUrl);
    const now = new Date();
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const result = await this.prisma.$transaction(async (tx: any) => {
      const deliveryOrder = await tx.deliveryOrder.findUnique({
        where: { id: dto.deliveryOrderId },
        include: {
          order: {
            select: {
              clientId: true,
              providerOrders: {
                select: {
                  providerId: true,
                },
              },
            },
          },
        },
      });

      if (!deliveryOrder) {
        throw new NotFoundException('DeliveryOrder not found');
      }

      const reporterRole = await this.resolveIncidentReporterRole(
        deliveryOrder,
        userId,
        roles,
      );

      const dailyCount = await tx.deliveryIncident.count({
        where: {
          reporterId: userId,
          createdAt: {
            gte: since,
          },
        },
      });

      if (dailyCount >= this.getIncidentDailyLimit()) {
        throw new HttpException(
          'Daily incident limit exceeded',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      const perDeliveryCount = await tx.deliveryIncident.count({
        where: {
          deliveryOrderId: dto.deliveryOrderId,
          reporterId: userId,
        },
      });

      if (perDeliveryCount >= this.getIncidentPerDeliveryLimit()) {
        throw new HttpException(
          'Incident limit exceeded for this delivery order',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      const incident = await tx.deliveryIncident.create({
        data: {
          deliveryOrderId: dto.deliveryOrderId,
          reporterId: userId,
          reporterRole,
          type: dto.type,
          status: DeliveryIncidentStatusValues.OPEN,
          description: dto.description,
          evidenceUrl: dto.evidenceUrl ?? null,
        },
      });

      this.logger.log(
        `incident.created incident=${incident.id} deliveryOrder=${incident.deliveryOrderId} actor=${userId} timestamp=${now.toISOString()}`,
      );

      return {
        incident: this.sanitizeIncident(incident),
        reporterRole,
        runnerId: deliveryOrder.runnerId ?? null,
      };
    });

    if (
      result.reporterRole === IncidentReporterRoleValues.CLIENT &&
      roles.includes(Role.CLIENT)
    ) {
      await this.emitRiskEvent(
        RiskActorType.CLIENT,
        userId,
        RiskCategory.CLIENT_INCIDENT_ABUSE,
        10,
        `incident:${result.incident.id}`,
        {
          incidentId: result.incident.id,
          deliveryOrderId: result.incident.deliveryOrderId,
        },
      );
    } else if (
      result.reporterRole === IncidentReporterRoleValues.RUNNER ||
      result.reporterRole === IncidentReporterRoleValues.PROVIDER
    ) {
      const actorType =
        result.reporterRole === IncidentReporterRoleValues.RUNNER
          ? RiskActorType.RUNNER
          : RiskActorType.PROVIDER;

      await this.emitRiskEvent(
        actorType,
        userId,
        RiskCategory.EXCESSIVE_INCIDENTS,
        8,
        `incident:${result.incident.id}`,
        {
          incidentId: result.incident.id,
          deliveryOrderId: result.incident.deliveryOrderId,
        },
      );
    }

    if (dto.type === 'FAILED_DELIVERY' && result.runnerId) {
      await this.emitRiskEvent(
        RiskActorType.RUNNER,
        result.runnerId,
        RiskCategory.DELIVERY_FAILURE_PATTERN,
        15,
        `delivery-failure:${result.incident.id}`,
        {
          incidentId: result.incident.id,
          deliveryOrderId: result.incident.deliveryOrderId,
        },
      );
    }

    return result.incident;
  }

  async getIncident(incidentId: string, userId: string, roles: Role[]) {
    const incident = await (this.prisma as any).deliveryIncident.findUnique({
      where: { id: incidentId },
      include: {
        deliveryOrder: {
          include: {
            order: {
              select: {
                clientId: true,
                providerOrders: {
                  select: {
                    providerId: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!incident) {
      throw new NotFoundException('Delivery incident not found');
    }

    await this.assertIncidentReadAccess(incident, userId, roles);
    return this.sanitizeIncident(incident);
  }

  async listDeliveryIncidents(
    deliveryOrderId: string,
    userId: string,
    roles: Role[],
  ) {
    const deliveryOrder = await (this.prisma as any).deliveryOrder.findUnique({
      where: { id: deliveryOrderId },
      include: {
        order: {
          select: {
            clientId: true,
            providerOrders: {
              select: {
                providerId: true,
              },
            },
          },
        },
      },
    });

    if (!deliveryOrder) {
      throw new NotFoundException('DeliveryOrder not found');
    }

    await this.resolveIncidentReporterRole(deliveryOrder, userId, roles);

    const incidents = await (this.prisma as any).deliveryIncident.findMany({
      where: {
        deliveryOrderId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return incidents.map((incident: any) => this.sanitizeIncident(incident));
  }

  async reviewIncident(incidentId: string, actorId: string) {
    return this.transitionIncidentStatus(
      incidentId,
      actorId,
      DeliveryIncidentStatusValues.UNDER_REVIEW,
    );
  }

  async resolveIncident(incidentId: string, actorId: string) {
    return this.transitionIncidentStatus(
      incidentId,
      actorId,
      DeliveryIncidentStatusValues.RESOLVED,
    );
  }

  async rejectIncident(incidentId: string, actorId: string) {
    return this.transitionIncidentStatus(
      incidentId,
      actorId,
      DeliveryIncidentStatusValues.REJECTED,
    );
  }

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
}
