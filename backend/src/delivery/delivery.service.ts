import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PaymentAccountOwnerType,
  PaymentAccountProvider,
  Prisma,
  RiskActorType,
  RiskCategory,
  Role,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RiskService } from '../risk/risk.service';
import { AssignDeliveryRunnerDto } from './dto/assign-delivery-runner.dto';
import { ConfirmDeliveryDto } from './dto/confirm-delivery.dto';
import { CreateDeliveryIncidentDto } from './dto/create-delivery-incident.dto';
import { CreateDeliveryOrderDto } from './dto/create-delivery-order.dto';
import { UpdateDeliveryLocationDto } from './dto/update-delivery-location.dto';
import { DeliveryDispatchService } from './delivery-dispatch.service';
import { DeliveryDomainPolicy } from './delivery-domain-policy';
import { DeliveryIncidentService } from './delivery-incident.service';
import { DeliveryLifecycleService } from './delivery-lifecycle.service';
import { DeliveryRunnerPaymentService } from './delivery-runner-payment.service';
import { DeliveryTrackingService } from './delivery-tracking.service';
import { DeliveryRunnerWebhookService } from './delivery-runner-webhook.service';
import { DeliveryOrderCreationService } from './delivery-order-creation.service';

type DeliveryOrderReadRecord = Prisma.DeliveryOrderGetPayload<{
  include: {
    order: {
      select: {
        clientId: true;
      };
    };
    paymentSessions: {
      orderBy: {
        createdAt: 'desc';
      };
    };
  };
}>;

type DeliveryOrderClientAccessRecord = Pick<
  DeliveryOrderReadRecord,
  'runnerId' | 'order'
>;

@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);
  private readonly domainPolicy = new DeliveryDomainPolicy();
  private readonly dispatchService: DeliveryDispatchService;
  private readonly incidentService: DeliveryIncidentService;
  private readonly lifecycleService: DeliveryLifecycleService;
  private readonly runnerPaymentService: DeliveryRunnerPaymentService;
  private readonly runnerWebhookService: DeliveryRunnerWebhookService;
  private readonly trackingService: DeliveryTrackingService;
  private readonly orderCreationService: DeliveryOrderCreationService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Optional() private readonly riskService?: RiskService,
  ) {
    this.dispatchService = new DeliveryDispatchService(
      this.prisma,
      this.domainPolicy,
      this.assertClientOrAdminAccess.bind(this),
      this.resolveActiveRunnerStripePaymentAccount.bind(this),
      this.logStructuredEvent.bind(this),
      this.emitRiskEvent.bind(this),
      this.getDispatchWindowMs.bind(this),
      this.getJobGrabbingWindowMs.bind(this),
      this.getJobGrabbingThreshold.bind(this),
      this.buildWindowKey.bind(this),
    );
    this.incidentService = new DeliveryIncidentService(
      this.prisma,
      this.domainPolicy,
      this.logger,
      this.emitRiskEvent.bind(this),
    );
    this.lifecycleService = new DeliveryLifecycleService(
      this.prisma,
      this.domainPolicy,
      this.logger,
      this.logStructuredEvent.bind(this),
    );
    this.runnerWebhookService = new DeliveryRunnerWebhookService(
      this.prisma,
      this.emitRiskEvent.bind(this),
    );
    this.runnerPaymentService = new DeliveryRunnerPaymentService(
      this.prisma,
      this.configService,
      this.logger,
      this.assertClientOrAdminAccess.bind(this),
      this.resolveActiveRunnerStripePaymentAccount.bind(this),
      this.emitRiskEvent.bind(this),
      this.runnerWebhookService,
    );
    this.trackingService = new DeliveryTrackingService(
      this.prisma,
      this.configService,
      this.domainPolicy,
      this.logger,
    );
    this.orderCreationService = new DeliveryOrderCreationService(
      this.prisma,
      this.dispatchService,
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
    deliveryOrder: DeliveryOrderClientAccessRecord,
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

  async createDeliveryOrder(
    dto: CreateDeliveryOrderDto,
    userId: string,
    roles: Role[],
  ) {
    return this.orderCreationService.createDeliveryOrder(dto, userId, roles);
  }

  async createDeliveryJob(deliveryOrderId: string) {
    return this.dispatchService.createDeliveryJob(deliveryOrderId);
  }

  async assignRunner(
    deliveryOrderId: string,
    dto: AssignDeliveryRunnerDto,
    userId: string,
    roles: Role[],
  ) {
    return this.dispatchService.assignRunner(
      deliveryOrderId,
      dto,
      userId,
      roles,
    );
  }

  async prepareRunnerPayment(
    deliveryOrderId: string,
    userId: string,
    roles: Role[],
  ) {
    return this.runnerPaymentService.prepareRunnerPayment(
      deliveryOrderId,
      userId,
      roles,
    );
  }

  async confirmRunnerPayment(externalSessionId: string, eventId?: string) {
    return this.runnerPaymentService.confirmRunnerPayment(
      externalSessionId,
      eventId,
    );
  }

  async failRunnerPayment(externalSessionId: string, eventId?: string) {
    return this.runnerPaymentService.failRunnerPayment(
      externalSessionId,
      eventId,
    );
  }

  async getDeliveryOrder(
    deliveryOrderId: string,
    userId: string,
    roles: Role[],
  ) {
    const deliveryOrder: DeliveryOrderReadRecord | null =
      await this.prisma.deliveryOrder.findUnique({
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
    return this.dispatchService.listAvailableJobs(runnerId);
  }

  async acceptDeliveryJob(jobId: string, runnerId: string) {
    return this.dispatchService.acceptDeliveryJob(jobId, runnerId);
  }

  async expireDeliveryJobs(now = new Date()) {
    return this.dispatchService.expireDeliveryJobs(now);
  }

  async updateRunnerLocation(
    deliveryOrderId: string,
    userId: string,
    roles: Role[],
    dto: UpdateDeliveryLocationDto,
  ) {
    try {
      return await this.trackingService.updateRunnerLocation(
        deliveryOrderId,
        userId,
        roles,
        dto,
      );
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
    return this.trackingService.getDeliveryTracking(
      deliveryOrderId,
      userId,
      roles,
    );
  }

  async getDeliveryLocationHistory(deliveryOrderId: string) {
    return this.trackingService.getDeliveryLocationHistory(deliveryOrderId);
  }

  async cleanupRunnerLocations(now = new Date()) {
    return this.trackingService.cleanupRunnerLocations(now);
  }

  async createIncident(
    dto: CreateDeliveryIncidentDto,
    userId: string,
    roles: Role[],
  ) {
    return this.incidentService.createIncident(dto, userId, roles);
  }

  async getIncident(incidentId: string, userId: string, roles: Role[]) {
    return this.incidentService.getIncident(incidentId, userId, roles);
  }

  async listDeliveryIncidents(
    deliveryOrderId: string,
    userId: string,
    roles: Role[],
  ) {
    return this.incidentService.listDeliveryIncidents(
      deliveryOrderId,
      userId,
      roles,
    );
  }

  async reviewIncident(incidentId: string, actorId: string) {
    return this.incidentService.reviewIncident(incidentId, actorId);
  }

  async resolveIncident(incidentId: string, actorId: string) {
    return this.incidentService.resolveIncident(incidentId, actorId);
  }

  async rejectIncident(incidentId: string, actorId: string) {
    return this.incidentService.rejectIncident(incidentId, actorId);
  }

  async markPickupPending(
    deliveryOrderId: string,
    userId: string,
    roles: Role[],
  ) {
    return this.lifecycleService.markPickupPending(
      deliveryOrderId,
      userId,
      roles,
    );
  }

  async confirmPickup(deliveryOrderId: string, userId: string, roles: Role[]) {
    return this.lifecycleService.confirmPickup(deliveryOrderId, userId, roles);
  }

  async startTransit(deliveryOrderId: string, userId: string, roles: Role[]) {
    return this.lifecycleService.startTransit(deliveryOrderId, userId, roles);
  }

  async confirmDelivery(
    deliveryOrderId: string,
    userId: string,
    roles: Role[],
    dto?: ConfirmDeliveryDto,
  ) {
    return this.lifecycleService.confirmDelivery(
      deliveryOrderId,
      userId,
      roles,
      dto,
    );
  }
}
