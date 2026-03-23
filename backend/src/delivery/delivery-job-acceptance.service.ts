import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DeliveryJobStatus,
  DeliveryOrderStatus,
  PaymentAccount,
  Prisma,
  RiskActorType,
  RiskCategory,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type PaymentAccountResolver = (
  runnerId: string,
) => Promise<PaymentAccount | null>;

type StructuredLogger = (
  event: string,
  payload: Record<string, string | number | boolean | null | undefined>,
  message: string,
) => void;

type RiskEmitter = (
  actorType: RiskActorType,
  actorId: string,
  category: RiskCategory,
  score: number,
  dedupKey: string,
  metadata?: Record<string, string | number | boolean>,
) => Promise<void>;

type AcceptedDeliveryJob = {
  jobId: string;
  deliveryOrderId: string;
  runnerId: string;
  status: DeliveryJobStatus;
};

@Injectable()
export class DeliveryJobAcceptanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolveActiveRunnerStripePaymentAccount: PaymentAccountResolver,
    private readonly logStructuredEvent: StructuredLogger,
    private readonly emitRiskEvent: RiskEmitter,
    private readonly getJobGrabbingWindowMs: () => number,
    private readonly getJobGrabbingThreshold: () => number,
    private readonly buildWindowKey: (now: Date, windowMs: number) => string,
  ) {}

  async acceptDeliveryJob(jobId: string, runnerId: string) {
    const now = new Date();

    const result = await this.prisma.$transaction<AcceptedDeliveryJob>(
      async (tx: Prisma.TransactionClient) => {
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
      },
    );

    const windowMs = this.getJobGrabbingWindowMs();
    this.logStructuredEvent(
      'delivery.assignment',
      {
        orderId: result.deliveryOrderId,
        runnerId,
      },
      'Delivery job accepted by runner',
    );

    const deliveryJobClaimClient = this.prisma.deliveryJobClaim;
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
}
