import {
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RiskActorType, RiskCategory, Role } from '@prisma/client';
import {
  DeliveryIncidentStatusValue,
  DeliveryIncidentStatusValues,
  IncidentReporterRoleValues,
} from './delivery-incident.constants';
import { DeliveryDomainPolicy } from './delivery-domain-policy';
import { CreateDeliveryIncidentDto } from './dto/create-delivery-incident.dto';
import { PrismaService } from '../prisma/prisma.service';

type RiskEmitter = (
  actorType: RiskActorType,
  actorId: string,
  category: RiskCategory,
  score: number,
  dedupKey: string,
  metadata?: Record<string, string | number | boolean>,
) => Promise<void>;

export class DeliveryIncidentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly domainPolicy: DeliveryDomainPolicy,
    private readonly logger: Logger,
    private readonly emitRiskEvent: RiskEmitter,
  ) {}

  private getIncidentDailyLimit() {
    return 10;
  }

  private getIncidentPerDeliveryLimit() {
    return 3;
  }

  async createIncident(
    dto: CreateDeliveryIncidentDto,
    userId: string,
    roles: Role[],
  ) {
    this.domainPolicy.validateEvidenceUrl(dto.evidenceUrl);
    const now = new Date();
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const result = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
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

        const reporterRole =
          await this.domainPolicy.resolveIncidentReporterRole(
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
          incident: this.domainPolicy.sanitizeIncident(incident),
          reporterRole,
          runnerId: deliveryOrder.runnerId ?? null,
        };
      },
    );

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
    const incident = await this.prisma.deliveryIncident.findUnique({
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

    await this.domainPolicy.assertIncidentReadAccess(incident, userId, roles);
    return this.domainPolicy.sanitizeIncident(incident);
  }

  async listDeliveryIncidents(
    deliveryOrderId: string,
    userId: string,
    roles: Role[],
  ) {
    const deliveryOrder = await this.prisma.deliveryOrder.findUnique({
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

    await this.domainPolicy.resolveIncidentReporterRole(
      deliveryOrder,
      userId,
      roles,
    );

    const incidents = await this.prisma.deliveryIncident.findMany({
      where: {
        deliveryOrderId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return incidents.map((incident) =>
      this.domainPolicy.sanitizeIncident(incident),
    );
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

  private async transitionIncidentStatus(
    incidentId: string,
    actorId: string,
    nextStatus: DeliveryIncidentStatusValue,
  ) {
    const now = new Date();

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
        return this.domainPolicy.sanitizeIncident(incident);
      }

      this.domainPolicy.validateIncidentTransition(incident.status, nextStatus);

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

      return this.domainPolicy.sanitizeIncident(updated);
    });
  }
}
