import {
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma, RiskActorType, RiskCategory, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RiskService } from '../risk/risk.service';
import { RequestRefundDto } from './dto/request-refund.dto';
import { RefundStatusValues } from './refund.constants';
import { RefundBoundaryService } from './refund-boundary.service';

@Injectable()
export class RefundRequestQueryService {
  private readonly logger = new Logger(RefundRequestQueryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly refundBoundaryService: RefundBoundaryService,
    @Optional() private readonly riskService?: RiskService,
  ) {}

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
        `risk.refund.integration_failed actorType=${actorType} actorId=${actorId} category=${category} message=${(error as Error).message}`,
      );
    }
  }

  async requestRefund(dto: RequestRefundDto, userId: string, roles: Role[]) {
    this.refundBoundaryService.ensureSingleBoundary(dto);
    const amount = Number(dto.amount);
    const currency = this.refundBoundaryService.normalizeCurrency(dto.currency);
    const now = new Date();

    const result = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const boundary =
          await this.refundBoundaryService.resolveBoundaryForRequest(tx, dto);
        this.refundBoundaryService.assertRequestAccess(boundary, userId, roles);
        this.refundBoundaryService.assertBoundaryPaid(boundary);
        this.refundBoundaryService.validateRefundBoundaryCurrency(
          boundary,
          currency,
        );
        this.refundBoundaryService.validateRefundType(
          boundary,
          dto.type,
          amount,
        );

        const existingRequests = await tx.refundRequest.count({
          where: this.refundBoundaryService.getBoundaryRequestCountWhere(
            boundary,
            userId,
          ),
        });
        this.refundBoundaryService.assertRequestLimit(existingRequests);

        await this.refundBoundaryService.assertRefundCapacity(
          tx,
          boundary,
          amount,
        );
        const incidentId =
          await this.refundBoundaryService.ensureIncidentMatchesBoundary(
            dto.incidentId,
            boundary,
            tx,
          );

        const refund = await tx.refundRequest.create({
          data: {
            incidentId,
            providerOrderId:
              boundary.kind === 'PROVIDER_ORDER' ? boundary.id : null,
            deliveryOrderId:
              boundary.kind === 'DELIVERY_ORDER' ? boundary.id : null,
            type: dto.type,
            status: RefundStatusValues.REQUESTED,
            amount,
            currency,
            requestedById: userId,
          },
        });

        this.logger.log(
          `refund.requested refundRequestId=${refund.id} boundaryType=${boundary.kind} boundaryId=${boundary.id} actorId=${userId} timestamp=${now.toISOString()}`,
        );

        return this.refundBoundaryService.sanitizeRefund(refund);
      },
    );

    if (roles.includes(Role.CLIENT) && !roles.includes(Role.ADMIN)) {
      const dedupKey = `refund-abuse:${result.id}`;
      const boundaryId = result.providerOrderId ?? result.deliveryOrderId;

      await this.emitRiskEvent(
        RiskActorType.CLIENT,
        userId,
        RiskCategory.CLIENT_REFUND_ABUSE,
        12,
        dedupKey,
        boundaryId
          ? {
              refundRequestId: result.id,
              boundaryId,
            }
          : {
              refundRequestId: result.id,
            },
      );
    }

    return result;
  }

  async getRefund(refundRequestId: string, userId: string, roles: Role[]) {
    const refund = await this.prisma.refundRequest.findUnique({
      where: { id: refundRequestId },
      include: {
        providerOrder: {
          include: {
            order: {
              select: {
                clientId: true,
              },
            },
          },
        },
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

    if (!refund) {
      throw new NotFoundException('Refund request not found');
    }

    this.refundBoundaryService.assertReadAccess(refund, userId, roles);
    return this.refundBoundaryService.sanitizeRefund(refund);
  }

  async listProviderOrderRefunds(
    providerOrderId: string,
    userId: string,
    roles: Role[],
  ) {
    const boundary = await this.refundBoundaryService.resolveProviderBoundary(
      this.prisma,
      providerOrderId,
    );

    if (
      !roles.includes(Role.ADMIN) &&
      !(roles.includes(Role.CLIENT) && boundary.clientId === userId) &&
      !(roles.includes(Role.PROVIDER) && boundary.providerId === userId)
    ) {
      throw new NotFoundException('ProviderOrder not found');
    }

    const refunds = await this.prisma.refundRequest.findMany({
      where: { providerOrderId },
      orderBy: { createdAt: 'desc' },
    });

    return refunds.map((refund) =>
      this.refundBoundaryService.sanitizeRefund(refund),
    );
  }

  async listDeliveryOrderRefunds(
    deliveryOrderId: string,
    userId: string,
    roles: Role[],
  ) {
    const boundary = await this.refundBoundaryService.resolveDeliveryBoundary(
      this.prisma,
      deliveryOrderId,
    );

    if (
      !roles.includes(Role.ADMIN) &&
      !(roles.includes(Role.CLIENT) && boundary.clientId === userId)
    ) {
      throw new NotFoundException('DeliveryOrder not found');
    }

    const refunds = await this.prisma.refundRequest.findMany({
      where: { deliveryOrderId },
      orderBy: { createdAt: 'desc' },
    });

    return refunds.map((refund) =>
      this.refundBoundaryService.sanitizeRefund(refund),
    );
  }
}
