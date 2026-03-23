import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const PAYMENT_WEBHOOK_EVENT_STATUS = {
  RECEIVED: 'RECEIVED',
  PROCESSED: 'PROCESSED',
  IGNORED: 'IGNORED',
  FAILED: 'FAILED',
} as const;

export type PaymentWebhookEventStatus =
  (typeof PAYMENT_WEBHOOK_EVENT_STATUS)[keyof typeof PAYMENT_WEBHOOK_EVENT_STATUS];

@Injectable()
export class PaymentWebhookEventService {
  private static readonly STALE_WEBHOOK_RECEIVED_MS = 5 * 60 * 1000;
  private static readonly FINAL_STATUSES = new Set<PaymentWebhookEventStatus>([
    PAYMENT_WEBHOOK_EVENT_STATUS.PROCESSED,
    PAYMENT_WEBHOOK_EVENT_STATUS.IGNORED,
  ]);

  constructor(private readonly prisma: PrismaService) {}

  async isProcessed(eventId: string): Promise<boolean> {
    const event = await this.prisma.paymentWebhookEvent.findUnique({
      where: { id: eventId },
      select: { status: true },
    });

    return event
      ? PaymentWebhookEventService.FINAL_STATUSES.has(
          event.status as PaymentWebhookEventStatus,
        )
      : false;
  }

  async claim(eventId: string, provider: string, eventType: string) {
    try {
      await this.prisma.paymentWebhookEvent.create({
        data: {
          id: eventId,
          provider,
          eventType,
          status: PAYMENT_WEBHOOK_EVENT_STATUS.RECEIVED,
        },
      });
      return true;
    } catch (error: unknown) {
      if ((error as { code?: string }).code === 'P2002') {
        const staleBefore = new Date(
          Date.now() - PaymentWebhookEventService.STALE_WEBHOOK_RECEIVED_MS,
        );
        const reclaimed = await this.prisma.paymentWebhookEvent.updateMany({
          where: {
            id: eventId,
            OR: [
              { status: PAYMENT_WEBHOOK_EVENT_STATUS.FAILED },
              {
                status: PAYMENT_WEBHOOK_EVENT_STATUS.RECEIVED,
                receivedAt: { lt: staleBefore },
              },
            ],
          },
          data: {
            provider,
            eventType,
            status: PAYMENT_WEBHOOK_EVENT_STATUS.RECEIVED,
            receivedAt: new Date(),
            processedAt: null,
          },
        });

        return reclaimed.count === 1;
      }

      throw error;
    }
  }

  async markStatus(
    eventId: string,
    status: PaymentWebhookEventStatus,
    processedAt?: Date,
  ) {
    await this.prisma.paymentWebhookEvent.update({
      where: { id: eventId },
      data: {
        status,
        ...(processedAt ? { processedAt } : {}),
      },
    });
  }
}
