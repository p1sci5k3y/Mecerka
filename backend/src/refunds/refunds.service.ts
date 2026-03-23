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
  PaymentAccountOwnerType,
  PaymentAccountProvider,
  Prisma,
  ProviderPaymentStatus,
  RiskActorType,
  RiskCategory,
  Role,
  RunnerPaymentStatus,
} from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { RiskService } from '../risk/risk.service';
import { RequestRefundDto } from './dto/request-refund.dto';
import {
  RefundStatusValue,
  RefundStatusValues,
  RefundTypeValue,
  RefundTypeValues,
} from './refund.constants';

type RefundBoundaryKind = 'PROVIDER_ORDER' | 'DELIVERY_ORDER';

type ProviderBoundary = {
  kind: 'PROVIDER_ORDER';
  id: string;
  providerId: string;
  clientId: string;
  orderId: string;
  incidentDeliveryOrderId: string | null;
  capturedAmount: number;
  currency: string;
  paymentRef: string | null;
  paymentStatus: ProviderPaymentStatus;
};

type DeliveryBoundary = {
  kind: 'DELIVERY_ORDER';
  id: string;
  runnerId: string | null;
  clientId: string;
  capturedAmount: number;
  currency: string;
  paymentRef: string | null;
  paymentStatus: RunnerPaymentStatus;
};

type RefundBoundary = ProviderBoundary | DeliveryBoundary;

@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);
  private readonly stripe: Stripe;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Optional() private readonly riskService?: RiskService,
  ) {
    const stripeSecretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      throw new Error(
        'STRIPE_SECRET_KEY is missing or empty in the environment configuration.',
      );
    }

    this.stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2026-02-25.clover',
    });
  }

  private sanitizeRefund(refund: any) {
    return {
      id: refund.id,
      incidentId: refund.incidentId ?? null,
      providerOrderId: refund.providerOrderId ?? null,
      deliveryOrderId: refund.deliveryOrderId ?? null,
      type: refund.type,
      status: refund.status,
      amount: refund.amount,
      currency: refund.currency,
      requestedById: refund.requestedById,
      reviewedById: refund.reviewedById ?? null,
      externalRefundId: refund.externalRefundId ?? null,
      createdAt: refund.createdAt,
      reviewedAt: refund.reviewedAt ?? null,
      completedAt: refund.completedAt ?? null,
    };
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
        `risk.refund.integration_failed actorType=${actorType} actorId=${actorId} category=${category} message=${(error as Error).message}`,
      );
    }
  }

  private ensureSingleBoundary(dto: RequestRefundDto) {
    const boundaries = [dto.providerOrderId, dto.deliveryOrderId].filter(
      Boolean,
    );

    if (boundaries.length !== 1) {
      throw new BadRequestException(
        'Refund requests must reference exactly one payment boundary',
      );
    }
  }

  private assertAdmin(roles: Role[]) {
    if (!roles.includes(Role.ADMIN)) {
      throw new ForbiddenException('Only admins can review or execute refunds');
    }
  }

  private normalizeCurrency(value: string) {
    return value.trim().toUpperCase();
  }

  private getActiveRefundStatuses(): RefundStatusValue[] {
    return [
      RefundStatusValues.REQUESTED,
      RefundStatusValues.UNDER_REVIEW,
      RefundStatusValues.APPROVED,
      RefundStatusValues.EXECUTING,
      RefundStatusValues.COMPLETED,
    ];
  }

  private getBoundaryRequestCountWhere(
    boundary: RefundBoundary,
    requestedById: string,
  ) {
    if (boundary.kind === 'PROVIDER_ORDER') {
      return {
        providerOrderId: boundary.id,
        requestedById,
      };
    }

    return {
      deliveryOrderId: boundary.id,
      requestedById,
    };
  }

  private getBoundaryAggregateWhere(
    boundary: RefundBoundary,
    excludeId?: string,
  ) {
    return {
      ...(boundary.kind === 'PROVIDER_ORDER'
        ? { providerOrderId: boundary.id }
        : { deliveryOrderId: boundary.id }),
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
      status: {
        in: this.getActiveRefundStatuses(),
      },
    };
  }

  private validateRefundType(
    boundary: RefundBoundary,
    type: RefundTypeValue,
    amount: number,
  ) {
    const capturedAmount = boundary.capturedAmount;

    if (
      boundary.kind === 'PROVIDER_ORDER' &&
      type !== RefundTypeValues.PROVIDER_FULL &&
      type !== RefundTypeValues.PROVIDER_PARTIAL
    ) {
      throw new BadRequestException(
        'Provider refunds must use a provider refund type',
      );
    }

    if (
      boundary.kind === 'DELIVERY_ORDER' &&
      type !== RefundTypeValues.DELIVERY_FULL &&
      type !== RefundTypeValues.DELIVERY_PARTIAL
    ) {
      throw new BadRequestException(
        'Delivery refunds must use a delivery refund type',
      );
    }

    const isFullRefund =
      type === RefundTypeValues.PROVIDER_FULL ||
      type === RefundTypeValues.DELIVERY_FULL;

    if (isFullRefund && amount !== capturedAmount) {
      throw new BadRequestException(
        'Full refund amount must match the captured payment amount',
      );
    }

    if (!isFullRefund && amount >= capturedAmount) {
      throw new BadRequestException(
        'Partial refund amount must be lower than the captured payment amount',
      );
    }
  }

  private validateRefundBoundaryCurrency(
    boundary: RefundBoundary,
    requestedCurrency: string,
  ) {
    if (this.normalizeCurrency(boundary.currency) !== requestedCurrency) {
      throw new BadRequestException(
        'Refund currency must match the original payment currency',
      );
    }
  }

  private assertRequestAccess(
    boundary: RefundBoundary,
    userId: string,
    roles: Role[],
  ) {
    if (roles.includes(Role.ADMIN)) {
      return;
    }

    if (roles.includes(Role.CLIENT) && boundary.clientId === userId) {
      return;
    }

    throw new ForbiddenException('You cannot request refunds for this payment');
  }

  private assertReadAccess(refund: any, userId: string, roles: Role[]) {
    if (roles.includes(Role.ADMIN)) {
      return;
    }

    if (refund.requestedById === userId) {
      return;
    }

    if (
      roles.includes(Role.PROVIDER) &&
      refund.providerOrder?.providerId === userId
    ) {
      return;
    }

    if (
      roles.includes(Role.CLIENT) &&
      (refund.providerOrder?.order?.clientId === userId ||
        refund.deliveryOrder?.order?.clientId === userId)
    ) {
      return;
    }

    throw new NotFoundException('Refund request not found');
  }

  private async resolveStripeAccount(
    ownerType: PaymentAccountOwnerType,
    ownerId: string,
  ) {
    const paymentAccount = await this.prisma.paymentAccount.findFirst({
      where: {
        ownerType,
        ownerId,
        provider: PaymentAccountProvider.STRIPE,
        isActive: true,
      },
    });

    if (paymentAccount) {
      return paymentAccount;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: {
        stripeAccountId: true,
      },
    });

    if (!user?.stripeAccountId) {
      return null;
    }

    return this.prisma.paymentAccount.upsert({
      where: {
        ownerType_ownerId_provider: {
          ownerType,
          ownerId,
          provider: PaymentAccountProvider.STRIPE,
        },
      },
      update: {
        externalAccountId: user.stripeAccountId,
        isActive: true,
      },
      create: {
        ownerType,
        ownerId,
        provider: PaymentAccountProvider.STRIPE,
        externalAccountId: user.stripeAccountId,
        isActive: true,
      },
    });
  }

  private async ensureIncidentMatchesBoundary(
    incidentId: string | undefined,
    boundary: RefundBoundary,
    tx: any,
  ) {
    if (!incidentId) {
      return null;
    }

    const incident = await tx.deliveryIncident.findUnique({
      where: { id: incidentId },
      select: {
        id: true,
        deliveryOrderId: true,
      },
    });

    if (!incident) {
      throw new NotFoundException('Delivery incident not found');
    }

    if (
      boundary.kind === 'DELIVERY_ORDER' &&
      incident.deliveryOrderId !== boundary.id
    ) {
      throw new BadRequestException(
        'Incident does not belong to the selected delivery payment boundary',
      );
    }

    if (
      boundary.kind === 'PROVIDER_ORDER' &&
      incident.deliveryOrderId !== boundary.incidentDeliveryOrderId
    ) {
      throw new BadRequestException(
        'Incident does not belong to the selected provider order',
      );
    }

    return incident.id;
  }

  private async resolveProviderBoundary(
    tx: any,
    providerOrderId: string,
  ): Promise<ProviderBoundary> {
    const providerOrder = await tx.providerOrder.findUnique({
      where: { id: providerOrderId },
      include: {
        order: {
          select: {
            id: true,
            clientId: true,
            deliveryOrder: {
              select: {
                id: true,
              },
            },
          },
        },
      },
    });

    if (!providerOrder) {
      throw new NotFoundException('ProviderOrder not found');
    }

    return {
      kind: 'PROVIDER_ORDER',
      id: providerOrder.id,
      providerId: providerOrder.providerId,
      clientId: providerOrder.order.clientId,
      orderId: providerOrder.order.id,
      incidentDeliveryOrderId: providerOrder.order.deliveryOrder?.id ?? null,
      capturedAmount: Number(providerOrder.subtotalAmount),
      currency: 'EUR',
      paymentRef: providerOrder.paymentRef,
      paymentStatus: providerOrder.paymentStatus,
    };
  }

  private async resolveDeliveryBoundary(
    tx: any,
    deliveryOrderId: string,
  ): Promise<DeliveryBoundary> {
    const deliveryOrder = await tx.deliveryOrder.findUnique({
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

    return {
      kind: 'DELIVERY_ORDER',
      id: deliveryOrder.id,
      runnerId: deliveryOrder.runnerId,
      clientId: deliveryOrder.order.clientId,
      capturedAmount: Number(deliveryOrder.deliveryFee),
      currency: deliveryOrder.currency,
      paymentRef: deliveryOrder.paymentRef,
      paymentStatus: deliveryOrder.paymentStatus,
    };
  }

  private async resolveBoundaryForRequest(tx: any, dto: RequestRefundDto) {
    if (dto.providerOrderId) {
      return this.resolveProviderBoundary(tx, dto.providerOrderId);
    }

    if (dto.deliveryOrderId) {
      return this.resolveDeliveryBoundary(tx, dto.deliveryOrderId);
    }

    throw new BadRequestException(
      'Refund requests must reference exactly one payment boundary',
    );
  }

  private assertBoundaryPaid(boundary: RefundBoundary) {
    if (
      boundary.kind === 'PROVIDER_ORDER' &&
      boundary.paymentStatus !== ProviderPaymentStatus.PAID
    ) {
      throw new ConflictException('ProviderOrder is not eligible for refunds');
    }

    if (
      boundary.kind === 'DELIVERY_ORDER' &&
      boundary.paymentStatus !== RunnerPaymentStatus.PAID
    ) {
      throw new ConflictException('DeliveryOrder is not eligible for refunds');
    }
  }

  private async assertRefundCapacity(
    tx: any,
    boundary: RefundBoundary,
    amount: number,
    excludeId?: string,
  ) {
    const aggregate = await tx.refundRequest.aggregate({
      where: this.getBoundaryAggregateWhere(boundary, excludeId),
      _sum: {
        amount: true,
      },
    });

    const reservedAmount = Number(aggregate._sum.amount ?? 0);
    if (reservedAmount + amount > boundary.capturedAmount) {
      throw new ConflictException(
        'Refund amount exceeds the captured payment amount',
      );
    }
  }

  async requestRefund(dto: RequestRefundDto, userId: string, roles: Role[]) {
    this.ensureSingleBoundary(dto);
    const amount = Number(dto.amount);
    const currency = this.normalizeCurrency(dto.currency);
    const now = new Date();

    const result = await this.prisma.$transaction(async (tx: any) => {
      const boundary = await this.resolveBoundaryForRequest(tx, dto);
      this.assertRequestAccess(boundary, userId, roles);
      this.assertBoundaryPaid(boundary);
      this.validateRefundBoundaryCurrency(boundary, currency);
      this.validateRefundType(boundary, dto.type, amount);

      const existingRequests = await tx.refundRequest.count({
        where: this.getBoundaryRequestCountWhere(boundary, userId),
      });
      if (existingRequests >= 3) {
        throw new HttpException(
          'Refund request limit exceeded for this payment boundary',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      await this.assertRefundCapacity(tx, boundary, amount);
      const incidentId = await this.ensureIncidentMatchesBoundary(
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

      return this.sanitizeRefund(refund);
    });

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
    const refund = await (this.prisma as any).refundRequest.findUnique({
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

    this.assertReadAccess(refund, userId, roles);
    return this.sanitizeRefund(refund);
  }

  async listProviderOrderRefunds(
    providerOrderId: string,
    userId: string,
    roles: Role[],
  ) {
    const boundary = await this.resolveProviderBoundary(
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

    const refunds = await (this.prisma as any).refundRequest.findMany({
      where: { providerOrderId },
      orderBy: { createdAt: 'desc' },
    });

    return refunds.map((refund: any) => this.sanitizeRefund(refund));
  }

  async listDeliveryOrderRefunds(
    deliveryOrderId: string,
    userId: string,
    roles: Role[],
  ) {
    const boundary = await this.resolveDeliveryBoundary(
      this.prisma,
      deliveryOrderId,
    );

    if (
      !roles.includes(Role.ADMIN) &&
      !(roles.includes(Role.CLIENT) && boundary.clientId === userId)
    ) {
      throw new NotFoundException('DeliveryOrder not found');
    }

    const refunds = await (this.prisma as any).refundRequest.findMany({
      where: { deliveryOrderId },
      orderBy: { createdAt: 'desc' },
    });

    return refunds.map((refund: any) => this.sanitizeRefund(refund));
  }

  private async transitionRefundStatus(
    refundRequestId: string,
    actorId: string,
    roles: Role[],
    currentStatuses: RefundStatusValue[],
    nextStatus: RefundStatusValue,
    eventName: string,
  ) {
    this.assertAdmin(roles);
    const now = new Date();

    return this.prisma.$transaction(async (tx: any) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT 1 FROM "RefundRequest" WHERE "id" = ${refundRequestId}::uuid FOR UPDATE`,
      );

      const refund = await tx.refundRequest.findUnique({
        where: { id: refundRequestId },
      });

      if (!refund) {
        throw new NotFoundException('Refund request not found');
      }

      if (refund.status === nextStatus) {
        return this.sanitizeRefund(refund);
      }

      if (!currentStatuses.includes(refund.status)) {
        throw new ConflictException(
          `Refund request cannot transition from ${refund.status} to ${nextStatus}`,
        );
      }

      const updated = await tx.refundRequest.update({
        where: { id: refundRequestId },
        data: {
          status: nextStatus,
          reviewedById: actorId,
          reviewedAt: refund.reviewedAt ?? now,
        },
      });

      this.logger.log(
        `${eventName} refundRequestId=${updated.id} boundaryType=${updated.providerOrderId ? 'PROVIDER_ORDER' : 'DELIVERY_ORDER'} boundaryId=${updated.providerOrderId ?? updated.deliveryOrderId} actorId=${actorId} timestamp=${now.toISOString()}`,
      );

      return this.sanitizeRefund(updated);
    });
  }

  async reviewRefund(refundRequestId: string, actorId: string, roles: Role[]) {
    return this.transitionRefundStatus(
      refundRequestId,
      actorId,
      roles,
      [RefundStatusValues.REQUESTED],
      RefundStatusValues.UNDER_REVIEW,
      'refund.review_started',
    );
  }

  async approveRefund(refundRequestId: string, actorId: string, roles: Role[]) {
    return this.transitionRefundStatus(
      refundRequestId,
      actorId,
      roles,
      [RefundStatusValues.UNDER_REVIEW],
      RefundStatusValues.APPROVED,
      'refund.approved',
    );
  }

  async rejectRefund(refundRequestId: string, actorId: string, roles: Role[]) {
    return this.transitionRefundStatus(
      refundRequestId,
      actorId,
      roles,
      [RefundStatusValues.UNDER_REVIEW],
      RefundStatusValues.REJECTED,
      'refund.rejected',
    );
  }

  private async lockProviderBoundaryForExecution(
    tx: any,
    providerOrderId: string,
  ) {
    await tx.$executeRaw(
      Prisma.sql`SELECT 1 FROM "ProviderOrder" WHERE "id" = ${providerOrderId}::uuid FOR UPDATE`,
    );
    const boundary = await this.resolveProviderBoundary(tx, providerOrderId);
    const paymentAccount = await this.resolveStripeAccount(
      PaymentAccountOwnerType.PROVIDER,
      boundary.providerId,
    );

    return {
      boundary,
      stripeAccountId: paymentAccount?.externalAccountId ?? null,
    };
  }

  private async lockDeliveryBoundaryForExecution(
    tx: any,
    deliveryOrderId: string,
  ) {
    await tx.$executeRaw(
      Prisma.sql`SELECT 1 FROM "DeliveryOrder" WHERE "id" = ${deliveryOrderId}::uuid FOR UPDATE`,
    );
    const boundary = await this.resolveDeliveryBoundary(tx, deliveryOrderId);

    if (!boundary.runnerId) {
      throw new ConflictException('DeliveryOrder has no assigned runner');
    }

    const paymentAccount = await this.resolveStripeAccount(
      PaymentAccountOwnerType.RUNNER,
      boundary.runnerId,
    );

    return {
      boundary,
      stripeAccountId: paymentAccount?.externalAccountId ?? null,
    };
  }

  async executeRefund(refundRequestId: string, actorId: string, roles: Role[]) {
    this.assertAdmin(roles);
    const now = new Date();

    const prepared = await this.prisma.$transaction(async (tx: any) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT 1 FROM "RefundRequest" WHERE "id" = ${refundRequestId}::uuid FOR UPDATE`,
      );

      const refund = await tx.refundRequest.findUnique({
        where: { id: refundRequestId },
      });

      if (!refund) {
        throw new NotFoundException('Refund request not found');
      }

      if (refund.status === RefundStatusValues.COMPLETED) {
        return {
          completed: true,
          refund: this.sanitizeRefund(refund),
        };
      }

      if (
        ![RefundStatusValues.APPROVED, RefundStatusValues.EXECUTING].includes(
          refund.status,
        )
      ) {
        throw new ConflictException(
          'Refund request is not approved for execution',
        );
      }

      const boundaryInfo = refund.providerOrderId
        ? await this.lockProviderBoundaryForExecution(
            tx,
            refund.providerOrderId,
          )
        : refund.deliveryOrderId
          ? await this.lockDeliveryBoundaryForExecution(
              tx,
              refund.deliveryOrderId,
            )
          : null;

      if (!boundaryInfo) {
        throw new BadRequestException(
          'Refund request must reference a valid payment boundary',
        );
      }

      this.assertBoundaryPaid(boundaryInfo.boundary);
      if (!boundaryInfo.boundary.paymentRef) {
        throw new ConflictException('Original payment reference is missing');
      }
      if (!boundaryInfo.stripeAccountId) {
        throw new ConflictException(
          'Connected account is missing for the selected payment boundary',
        );
      }

      await this.assertRefundCapacity(
        tx,
        boundaryInfo.boundary,
        Number(refund.amount),
        refund.id,
      );

      const executingRefund = await tx.refundRequest.update({
        where: { id: refund.id },
        data: {
          status: RefundStatusValues.EXECUTING,
          reviewedById: refund.reviewedById ?? actorId,
          reviewedAt: refund.reviewedAt ?? now,
        },
      });

      return {
        completed: false,
        refund: {
          ...executingRefund,
          amount: refund.amount,
        },
        boundary: boundaryInfo.boundary,
        stripeAccountId: boundaryInfo.stripeAccountId,
      };
    });

    if (prepared.completed) {
      return prepared.refund;
    }

    const preparedExecution = prepared as {
      completed: false;
      refund: any;
      boundary: RefundBoundary;
      stripeAccountId: string;
    };
    const preparedBoundary = preparedExecution.boundary;

    try {
      const stripeRefund = await this.stripe.refunds.create(
        {
          payment_intent: preparedBoundary.paymentRef!,
          amount: Math.round(Number(preparedExecution.refund.amount) * 100),
          metadata: {
            refundRequestId: preparedExecution.refund.id,
            boundaryType: preparedBoundary.kind,
            boundaryId: preparedBoundary.id,
          },
        },
        {
          stripeAccount: preparedExecution.stripeAccountId,
          idempotencyKey: `refund-request:${preparedExecution.refund.id}`,
        },
      );

      const completed = await this.prisma.$transaction(async (tx: any) => {
        await tx.$executeRaw(
          Prisma.sql`SELECT 1 FROM "RefundRequest" WHERE "id" = ${preparedExecution.refund.id}::uuid FOR UPDATE`,
        );

        const locked = await tx.refundRequest.findUnique({
          where: { id: preparedExecution.refund.id },
        });

        if (!locked) {
          throw new NotFoundException('Refund request not found');
        }

        if (locked.status === RefundStatusValues.COMPLETED) {
          return locked;
        }

        return tx.refundRequest.update({
          where: { id: preparedExecution.refund.id },
          data: {
            status: RefundStatusValues.COMPLETED,
            externalRefundId: stripeRefund.id,
            completedAt: new Date(),
          },
        });
      });

      this.logger.log(
        `refund.executed refundRequestId=${completed.id} boundaryType=${preparedBoundary.kind} boundaryId=${preparedBoundary.id} actorId=${actorId} timestamp=${new Date().toISOString()}`,
      );

      return this.sanitizeRefund(completed);
    } catch (error) {
      await (this.prisma as any).refundRequest.update({
        where: { id: preparedExecution.refund.id },
        data: {
          status: RefundStatusValues.FAILED,
        },
      });

      this.logger.error(
        `refund.failed refundRequestId=${preparedExecution.refund.id} boundaryType=${preparedBoundary.kind} boundaryId=${preparedBoundary.id} actorId=${actorId} timestamp=${new Date().toISOString()}`,
      );
      throw error;
    }
  }
}
