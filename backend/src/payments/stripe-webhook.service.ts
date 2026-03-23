import {
  Injectable,
  ConflictException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import {
  PAYMENT_WEBHOOK_EVENT_STATUS,
  PaymentWebhookEventService,
} from './payment-webhook-event.service';
import {
  PaymentConfirmationPayload,
  ProviderPaymentConfirmationResult,
} from './provider-payment-confirmation.types';
import { ProviderPaymentConfirmationService } from './provider-payment-confirmation.service';

export type { PaymentConfirmationPayload } from './provider-payment-confirmation.types';

@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly paymentWebhookEventService: PaymentWebhookEventService,
    private readonly providerPaymentConfirmationService: ProviderPaymentConfirmationService,
  ) {}

  async isProcessed(eventId: string): Promise<boolean> {
    return this.paymentWebhookEventService.isProcessed(eventId);
  }

  /**
   * Completes the payment process idempotently using a webhook event ID.
   * Handles partial fulfillment if stock runs out concurrently.
   */
  async confirmProviderOrderPayment(
    externalSessionId: string,
    eventId: string,
    eventType: string,
    confirmation?: PaymentConfirmationPayload,
  ) {
    const claimed = await this.paymentWebhookEventService.claim(
      eventId,
      'STRIPE',
      eventType,
    );
    if (!claimed) {
      return { message: 'Webhook already processed' };
    }

    try {
      const result: ProviderPaymentConfirmationResult =
        await this.providerPaymentConfirmationService.confirmProviderOrderPayment(
          externalSessionId,
          eventId,
          confirmation,
        );

      if ('_events' in result) {
        this.eventEmitter.emit(
          'order.stateChanged',
          result._events.stateChanged,
        );
        if (result._events.partialCancelled) {
          this.eventEmitter.emit(
            'order.partialCancelled',
            result._events.partialCancelled,
          );
        }
        const { _events, ...resultWithoutEvents } = result;
        void _events;
        await this.paymentWebhookEventService.markStatus(
          eventId,
          PAYMENT_WEBHOOK_EVENT_STATUS.PROCESSED,
          new Date(),
        );
        return resultWithoutEvents;
      }

      await this.paymentWebhookEventService.markStatus(
        eventId,
        PAYMENT_WEBHOOK_EVENT_STATUS.IGNORED,
        new Date(),
      );

      return result;
    } catch (error) {
      await this.paymentWebhookEventService.markStatus(
        eventId,
        PAYMENT_WEBHOOK_EVENT_STATUS.FAILED,
        new Date(),
      );
      throw error;
    }
  }

  /**
   * @deprecated Legacy root-order payment wrapper.
   * Use confirmProviderOrderPayment(externalSessionId, eventId, eventType) instead.
   * This wrapper is restricted to single-provider orders only.
   */
  async confirmPayment(orderId: string, paymentRef: string, eventId: string) {
    if (await this.isProcessed(eventId)) {
      return { message: 'Webhook already processed' };
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        providerOrders: {
          select: { id: true },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.providerOrders.length !== 1) {
      throw new ConflictException(
        'Legacy payment confirmation wrapper only supports single-provider orders',
      );
    }

    this.logger.warn(
      `Deprecated confirmPayment(orderId=..., paymentRef=...) wrapper invoked for order ${orderId}`,
    );

    void paymentRef;
    throw new ConflictException(
      'Legacy payment confirmation wrapper is disabled. Use verified provider webhook confirmation instead.',
    );
  }
}
