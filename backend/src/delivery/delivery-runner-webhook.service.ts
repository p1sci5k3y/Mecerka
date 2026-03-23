import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  DeliveryOrderStatus,
  PaymentAccountProvider,
  PaymentSessionStatus,
  Prisma,
  RiskActorType,
  RiskCategory,
  RunnerPaymentStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type RiskEmitter = (
  actorType: RiskActorType,
  actorId: string,
  category: RiskCategory,
  score: number,
  dedupKey: string,
  metadata?: Record<string, string | number | boolean>,
) => Promise<void>;

export type DuplicateRunnerWebhookResult = {
  message: string;
  deliveryOrderId?: string;
  status?: DeliveryOrderStatus;
  paymentStatus?: RunnerPaymentStatus;
};

export type RunnerPaymentConfirmationResult =
  | DuplicateRunnerWebhookResult
  | {
      deliveryOrderId: string;
      status: DeliveryOrderStatus;
      paymentStatus: RunnerPaymentStatus;
    };

export type RunnerPaymentFailureResult =
  | DuplicateRunnerWebhookResult
  | {
      deliveryOrderId: string;
      status: DeliveryOrderStatus;
      paymentStatus: RunnerPaymentStatus;
      clientId?: string;
    };

export class DeliveryRunnerWebhookService {
  private static readonly WEBHOOK_STATUS_RECEIVED = 'RECEIVED';
  private static readonly WEBHOOK_STATUS_PROCESSED = 'PROCESSED';
  private static readonly WEBHOOK_STATUS_IGNORED = 'IGNORED';
  private static readonly WEBHOOK_STATUS_FAILED = 'FAILED';

  constructor(
    private readonly prisma: PrismaService,
    private readonly emitRiskEvent: RiskEmitter,
  ) {}

  async confirmRunnerPayment(
    externalSessionId: string,
    eventId?: string,
  ): Promise<RunnerPaymentConfirmationResult> {
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
      const result =
        await this.prisma.$transaction<RunnerPaymentConfirmationResult>(
          async (tx: Prisma.TransactionClient) => {
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
              session.deliveryOrder.status ===
                DeliveryOrderStatus.RUNNER_ASSIGNED
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
          },
        );

      if (eventId) {
        await this.markRunnerWebhookEventStatus(
          eventId,
          'message' in result
            ? DeliveryRunnerWebhookService.WEBHOOK_STATUS_IGNORED
            : DeliveryRunnerWebhookService.WEBHOOK_STATUS_PROCESSED,
          new Date(),
        );
      }

      return result;
    } catch (error) {
      if (eventId) {
        await this.markRunnerWebhookEventStatus(
          eventId,
          DeliveryRunnerWebhookService.WEBHOOK_STATUS_FAILED,
          new Date(),
        );
      }
      throw error;
    }
  }

  async failRunnerPayment(
    externalSessionId: string,
    eventId?: string,
  ): Promise<RunnerPaymentFailureResult> {
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
      const result = await this.prisma.$transaction<RunnerPaymentFailureResult>(
        async (tx: Prisma.TransactionClient) => {
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
        },
      );

      if (eventId) {
        await this.markRunnerWebhookEventStatus(
          eventId,
          'message' in result
            ? DeliveryRunnerWebhookService.WEBHOOK_STATUS_IGNORED
            : DeliveryRunnerWebhookService.WEBHOOK_STATUS_PROCESSED,
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
          DeliveryRunnerWebhookService.WEBHOOK_STATUS_FAILED,
          new Date(),
        );
      }
      throw error;
    }
  }

  private async claimRunnerWebhookEvent(eventId: string, eventType: string) {
    try {
      await this.prisma.runnerWebhookEvent.create({
        data: {
          id: eventId,
          provider: PaymentAccountProvider.STRIPE,
          eventType,
          status: DeliveryRunnerWebhookService.WEBHOOK_STATUS_RECEIVED,
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
    await this.prisma.runnerWebhookEvent.update({
      where: { id: eventId },
      data: {
        status,
        ...(processedAt ? { processedAt } : {}),
      },
    });
  }
}
