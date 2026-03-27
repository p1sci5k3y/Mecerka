import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentAccountOwnerType, Prisma, Role } from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { RequestRefundDto } from './dto/request-refund.dto';
import { RefundStatusValue, RefundStatusValues } from './refund.constants';
import {
  RefundBoundary,
  RefundBaseRecord,
  SanitizedRefund,
  RefundBoundaryService,
} from './refund-boundary.service';
import { RefundRequestQueryService } from './refund-request-query.service';

type PendingRefundExecution = {
  completed: false;
  refund: RefundBaseRecord;
  boundary: RefundBoundary;
  stripeAccountId: string;
};

type CompletedRefundExecution = {
  completed: true;
  refund: SanitizedRefund;
};

type RefundExecutionPreparation =
  | PendingRefundExecution
  | CompletedRefundExecution;

@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);
  private readonly stripe: Stripe;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly refundBoundaryService: RefundBoundaryService,
    private readonly refundRequestQueryService: RefundRequestQueryService,
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

  private assertAdmin(roles: Role[]) {
    if (!roles.includes(Role.ADMIN)) {
      throw new ForbiddenException('Only admins can review or execute refunds');
    }
  }

  async requestRefund(dto: RequestRefundDto, userId: string, roles: Role[]) {
    return this.refundRequestQueryService.requestRefund(dto, userId, roles);
  }

  async getRefund(refundRequestId: string, userId: string, roles: Role[]) {
    return this.refundRequestQueryService.getRefund(
      refundRequestId,
      userId,
      roles,
    );
  }

  async listProviderOrderRefunds(
    providerOrderId: string,
    userId: string,
    roles: Role[],
  ) {
    return this.refundRequestQueryService.listProviderOrderRefunds(
      providerOrderId,
      userId,
      roles,
    );
  }

  async listDeliveryOrderRefunds(
    deliveryOrderId: string,
    userId: string,
    roles: Role[],
  ) {
    return this.refundRequestQueryService.listDeliveryOrderRefunds(
      deliveryOrderId,
      userId,
      roles,
    );
  }

  async listClientRefunds(userId: string) {
    return this.refundRequestQueryService.listClientRefunds(userId);
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

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
        return this.refundBoundaryService.sanitizeRefund(refund);
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

      return this.refundBoundaryService.sanitizeRefund(updated);
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
    tx: Prisma.TransactionClient,
    providerOrderId: string,
  ) {
    await tx.$executeRaw(
      Prisma.sql`SELECT 1 FROM "ProviderOrder" WHERE "id" = ${providerOrderId}::uuid FOR UPDATE`,
    );
    const boundary = await this.refundBoundaryService.resolveProviderBoundary(
      tx,
      providerOrderId,
    );
    const paymentAccount =
      await this.refundBoundaryService.resolveStripeAccount(
        PaymentAccountOwnerType.PROVIDER,
        boundary.providerId,
      );

    return {
      boundary,
      stripeAccountId: paymentAccount?.externalAccountId ?? null,
    };
  }

  private async lockDeliveryBoundaryForExecution(
    tx: Prisma.TransactionClient,
    deliveryOrderId: string,
  ) {
    await tx.$executeRaw(
      Prisma.sql`SELECT 1 FROM "DeliveryOrder" WHERE "id" = ${deliveryOrderId}::uuid FOR UPDATE`,
    );
    const boundary = await this.refundBoundaryService.resolveDeliveryBoundary(
      tx,
      deliveryOrderId,
    );

    if (!boundary.runnerId) {
      throw new ConflictException('DeliveryOrder has no assigned runner');
    }

    const paymentAccount =
      await this.refundBoundaryService.resolveStripeAccount(
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
    const executableStatuses: RefundStatusValue[] = [
      RefundStatusValues.APPROVED,
      RefundStatusValues.EXECUTING,
    ];

    const prepared = await this.prisma.$transaction<RefundExecutionPreparation>(
      async (tx: Prisma.TransactionClient) => {
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
            refund: this.refundBoundaryService.sanitizeRefund(refund),
          };
        }

        if (!executableStatuses.includes(refund.status)) {
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

        this.refundBoundaryService.assertBoundaryPaid(boundaryInfo.boundary);
        if (!boundaryInfo.boundary.paymentRef) {
          throw new ConflictException('Original payment reference is missing');
        }
        if (!boundaryInfo.stripeAccountId) {
          throw new ConflictException(
            'Connected account is missing for the selected payment boundary',
          );
        }

        await this.refundBoundaryService.assertRefundCapacity(
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
      },
    );

    if (prepared.completed) {
      return prepared.refund;
    }

    const preparedExecution = prepared;
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

      const completed = await this.prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
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
        },
      );

      this.logger.log(
        `refund.executed refundRequestId=${completed.id} boundaryType=${preparedBoundary.kind} boundaryId=${preparedBoundary.id} actorId=${actorId} timestamp=${new Date().toISOString()}`,
      );

      return this.refundBoundaryService.sanitizeRefund(completed);
    } catch (error) {
      await this.prisma.refundRequest.update({
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
