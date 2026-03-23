import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  DeliveryJobStatus,
  DeliveryOrderStatus,
  PaymentAccount,
  Prisma,
  RiskActorType,
  RiskCategory,
  Role,
} from '@prisma/client';
import { AssignDeliveryRunnerDto } from './dto/assign-delivery-runner.dto';
import { DeliveryDomainPolicy } from './delivery-domain-policy';
import { PrismaService } from '../prisma/prisma.service';
import { DeliveryJobAcceptanceService } from './delivery-job-acceptance.service';

type ClientAccessAsserter = (
  clientId: string,
  userId: string,
  roles: Role[],
) => void;

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

type DeliveryJobListRecord = Prisma.DeliveryJobGetPayload<{
  include: {
    deliveryOrder: {
      include: {
        order: {
          select: {
            city: {
              select: {
                name: true;
              };
            };
          };
        };
      };
    };
    claims: {
      where: {
        runnerId: string;
      };
      select: {
        id: true;
      };
    };
  };
}>;

type DeliveryJobListRecordWithoutClaims = Prisma.DeliveryJobGetPayload<{
  include: {
    deliveryOrder: {
      include: {
        order: {
          select: {
            city: {
              select: {
                name: true;
              };
            };
          };
        };
      };
    };
  };
}>;

type DeliveryJobListing = ReturnType<DeliveryDomainPolicy['buildJobListing']>;

export class DeliveryDispatchService {
  private readonly deliveryJobAcceptanceService: DeliveryJobAcceptanceService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly domainPolicy: DeliveryDomainPolicy,
    private readonly assertClientOrAdminAccess: ClientAccessAsserter,
    private readonly resolveActiveRunnerStripePaymentAccount: PaymentAccountResolver,
    private readonly logStructuredEvent: StructuredLogger,
    private readonly emitRiskEvent: RiskEmitter,
    private readonly getDispatchWindowMs: () => number,
    private readonly getJobGrabbingWindowMs: () => number,
    private readonly getJobGrabbingThreshold: () => number,
    private readonly buildWindowKey: (now: Date, windowMs: number) => string,
  ) {
    this.deliveryJobAcceptanceService = new DeliveryJobAcceptanceService(
      this.prisma,
      this.resolveActiveRunnerStripePaymentAccount,
      this.logStructuredEvent,
      this.emitRiskEvent,
      this.getJobGrabbingWindowMs,
      this.getJobGrabbingThreshold,
      this.buildWindowKey,
    );
  }

  async createInitialDeliveryJob(
    tx: Prisma.TransactionClient,
    deliveryOrderId: string,
  ) {
    return this.createDeliveryJobRecord(tx, deliveryOrderId);
  }

  async createDeliveryJob(deliveryOrderId: string) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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

      const assignableStatuses: DeliveryOrderStatus[] = [
        DeliveryOrderStatus.PENDING,
        DeliveryOrderStatus.RUNNER_ASSIGNED,
      ];
      if (!assignableStatuses.includes(deliveryOrder.status)) {
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

  async listAvailableJobs(runnerId?: string) {
    const now = new Date();
    const jobs = await this.prisma.deliveryJob.findMany({
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

    const typedJobs = jobs as Array<
      DeliveryJobListRecord | DeliveryJobListRecordWithoutClaims
    >;

    return typedJobs
      .filter((job) => {
        if (!runnerId) {
          return true;
        }

        return 'claims' in job ? job.claims.length === 0 : true;
      })
      .map((job) =>
        this.domainPolicy.buildJobListing(job as DeliveryJobListRecord),
      ) as DeliveryJobListing[];
  }

  async acceptDeliveryJob(jobId: string, runnerId: string) {
    return this.deliveryJobAcceptanceService.acceptDeliveryJob(jobId, runnerId);
  }

  async expireDeliveryJobs(now = new Date()) {
    const result = await this.prisma.deliveryJob.updateMany({
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

  private async createDeliveryJobRecord(
    tx: Prisma.TransactionClient,
    deliveryOrderId: string,
  ) {
    return tx.deliveryJob.create({
      data: {
        deliveryOrderId,
        status: DeliveryJobStatus.OPEN,
        expiresAt: new Date(Date.now() + this.getDispatchWindowMs()),
      },
    });
  }
}
