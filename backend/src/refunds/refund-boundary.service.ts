import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PaymentAccountOwnerType,
  Prisma,
  ProviderPaymentStatus,
  Role,
  RunnerPaymentStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RequestRefundDto } from './dto/request-refund.dto';
import { RefundBoundaryResolutionService } from './refund-boundary-resolution.service';
import {
  RefundStatusValue,
  RefundStatusValues,
  RefundTypeValue,
  RefundTypeValues,
} from './refund.constants';

export type ProviderBoundary = {
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

export type DeliveryBoundary = {
  kind: 'DELIVERY_ORDER';
  id: string;
  runnerId: string | null;
  clientId: string;
  capturedAmount: number;
  currency: string;
  paymentRef: string | null;
  paymentStatus: RunnerPaymentStatus;
};

export type RefundBoundary = ProviderBoundary | DeliveryBoundary;

export type RefundBaseRecord = Prisma.RefundRequestGetPayload<
  Record<string, never>
>;

export type RefundReadRecord = Prisma.RefundRequestGetPayload<{
  include: {
    providerOrder: {
      include: {
        order: {
          select: {
            clientId: true;
          };
        };
      };
    };
    deliveryOrder: {
      include: {
        order: {
          select: {
            clientId: true;
          };
        };
      };
    };
  };
}>;

export type SanitizedRefund = {
  id: string;
  incidentId: string | null;
  providerOrderId: string | null;
  deliveryOrderId: string | null;
  type: RefundTypeValue;
  status: RefundStatusValue;
  amount: number;
  currency: string;
  requestedById: string;
  reviewedById: string | null;
  externalRefundId: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
  completedAt: Date | null;
};

export type RefundDataClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class RefundBoundaryService {
  private readonly resolutionService: RefundBoundaryResolutionService;

  constructor(private readonly prisma: PrismaService) {
    this.resolutionService = new RefundBoundaryResolutionService(this.prisma);
  }

  sanitizeRefund(refund: RefundBaseRecord): SanitizedRefund {
    return {
      id: refund.id,
      incidentId: refund.incidentId ?? null,
      providerOrderId: refund.providerOrderId ?? null,
      deliveryOrderId: refund.deliveryOrderId ?? null,
      type: refund.type,
      status: refund.status,
      amount: Number(refund.amount),
      currency: refund.currency,
      requestedById: refund.requestedById,
      reviewedById: refund.reviewedById ?? null,
      externalRefundId: refund.externalRefundId ?? null,
      createdAt: refund.createdAt,
      reviewedAt: refund.reviewedAt ?? null,
      completedAt: refund.completedAt ?? null,
    };
  }

  ensureSingleBoundary(dto: RequestRefundDto) {
    const boundaries = [dto.providerOrderId, dto.deliveryOrderId].filter(
      Boolean,
    );

    if (boundaries.length !== 1) {
      throw new BadRequestException(
        'Refund requests must reference exactly one payment boundary',
      );
    }
  }

  normalizeCurrency(value: string) {
    return value.trim().toUpperCase();
  }

  validateRefundType(
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

  validateRefundBoundaryCurrency(
    boundary: RefundBoundary,
    requestedCurrency: string,
  ) {
    if (this.normalizeCurrency(boundary.currency) !== requestedCurrency) {
      throw new BadRequestException(
        'Refund currency must match the original payment currency',
      );
    }
  }

  assertRequestAccess(boundary: RefundBoundary, userId: string, roles: Role[]) {
    if (roles.includes(Role.ADMIN)) {
      return;
    }

    if (roles.includes(Role.CLIENT) && boundary.clientId === userId) {
      return;
    }

    throw new ForbiddenException('You cannot request refunds for this payment');
  }

  assertReadAccess(refund: RefundReadRecord, userId: string, roles: Role[]) {
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

  async resolveStripeAccount(
    ownerType: PaymentAccountOwnerType,
    ownerId: string,
  ) {
    return this.resolutionService.resolveStripeAccount(ownerType, ownerId);
  }

  async ensureIncidentMatchesBoundary(
    incidentId: string | undefined,
    boundary: RefundBoundary,
    tx: RefundDataClient,
  ) {
    return this.resolutionService.ensureIncidentMatchesBoundary(
      incidentId,
      boundary,
      tx,
    );
  }

  async resolveProviderBoundary(
    tx: RefundDataClient,
    providerOrderId: string,
  ): Promise<ProviderBoundary> {
    return this.resolutionService.resolveProviderBoundary(tx, providerOrderId);
  }

  async resolveDeliveryBoundary(
    tx: RefundDataClient,
    deliveryOrderId: string,
  ): Promise<DeliveryBoundary> {
    return this.resolutionService.resolveDeliveryBoundary(tx, deliveryOrderId);
  }

  async resolveBoundaryForRequest(tx: RefundDataClient, dto: RequestRefundDto) {
    return this.resolutionService.resolveBoundaryForRequest(tx, dto);
  }

  assertBoundaryPaid(boundary: RefundBoundary) {
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

  async assertRefundCapacity(
    tx: RefundDataClient,
    boundary: RefundBoundary,
    amount: number,
    excludeId?: string,
  ) {
    const aggregate = await tx.refundRequest.aggregate({
      where: {
        ...(boundary.kind === 'PROVIDER_ORDER'
          ? { providerOrderId: boundary.id }
          : { deliveryOrderId: boundary.id }),
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
        status: {
          in: [
            RefundStatusValues.REQUESTED,
            RefundStatusValues.UNDER_REVIEW,
            RefundStatusValues.APPROVED,
            RefundStatusValues.EXECUTING,
            RefundStatusValues.COMPLETED,
          ],
        },
      },
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

  getBoundaryRequestCountWhere(
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

  assertRequestLimit(existingRequests: number) {
    if (existingRequests >= 3) {
      throw new HttpException(
        'Refund request limit exceeded for this payment boundary',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
