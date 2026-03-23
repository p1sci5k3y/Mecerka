import {
  Controller,
  Post,
  Req,
  Res,
  Headers,
  Logger,
  HttpStatus,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import Stripe from 'stripe';
import { PaymentsService } from './payments.service';

// Requerimos que la request contenga la propiedad rawBody, inyectada por NestFactory({rawBody: true})
interface RequestWithRawBody extends Request {
  rawBody: Buffer;
}

@SkipThrottle() // Stripe retries quickly on failure — throttle would cause permanent event loss
@Controller('webhooks/stripe')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;
  private readonly stripeApiVersion: Stripe.LatestApiVersion =
    '2026-02-25.clover';

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly configService: ConfigService,
  ) {
    const stripeKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    const webhookKey = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!stripeKey || !webhookKey) {
      throw new Error('Missing Stripe configuration secrets');
    }

    this.stripe = new Stripe(stripeKey, {
      apiVersion: this.stripeApiVersion,
    });
    this.webhookSecret = webhookKey;
  }

  @Post()
  async handleStripeWebhook(
    @Req() req: RequestWithRawBody,
    @Res() res: Response,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!signature) {
      this.logger.error('Missing stripe-signature header');
      return res.status(HttpStatus.BAD_REQUEST).send('Missing signature');
    }

    if (!req.rawBody) {
      this.logger.error(
        'Missing raw body in request. Ensure rawBody: true is enabled in main.ts',
      );
      return res.status(HttpStatus.BAD_REQUEST).send('Missing raw body');
    }

    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(
        req.rawBody,
        signature,
        this.webhookSecret,
      );
    } catch (err: unknown) {
      this.logger.error(
        `Webhook signature verification failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      // Return a generic error to the client while logging the detailed exception internally
      return res
        .status(HttpStatus.BAD_REQUEST)
        .send(`Webhook verification failed`);
    }

    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object;
      const paymentRef = paymentIntent.id;

      if (!paymentRef || typeof paymentRef !== 'string') {
        this.logger.warn('payment_intent.succeeded missing payment intent id');
        return res.status(HttpStatus.OK).json({ received: true });
      }

      // Idempotency check: short-circuit only terminally processed events.
      // FAILED events must remain retryable.
      if (await this.paymentsService.isProcessed(event.id)) {
        this.logger.debug(`Webhook event ${event.id} already processed.`);
        return res.status(HttpStatus.OK).json({ received: true });
      }

      try {
        const paymentConfirmation = {
          amount:
            typeof paymentIntent.amount === 'number'
              ? paymentIntent.amount
              : null,
          amountReceived:
            typeof paymentIntent.amount_received === 'number'
              ? paymentIntent.amount_received
              : null,
          currency:
            typeof paymentIntent.currency === 'string'
              ? paymentIntent.currency
              : null,
          accountId: typeof event.account === 'string' ? event.account : null,
          metadata:
            paymentIntent.metadata && typeof paymentIntent.metadata === 'object'
              ? paymentIntent.metadata
              : null,
        };
        const result = await this.paymentsService.confirmProviderOrderPayment(
          paymentRef,
          event.id,
          event.type,
          paymentConfirmation,
        );
        const status = 'status' in result ? result.status : 'unknown';
        this.logger.log(
          `Provider payment confirmed via Webhook. Session: ${paymentRef}. Status: ${status}`,
        );
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        // Ignore known concurrent errors if already processed successfully by an overlapping webhook
        if (errorMessage.includes('Concurrent stock update detected')) {
          this.logger.warn(
            `Ignored concurrent retry or conflict for provider payment ${paymentRef}: ${errorMessage}`,
          );
          return res.status(HttpStatus.OK).json({ received: true });
        }

        // Stripe requires a 500 status on unhandled backend errors so it can retry later
        this.logger.error(
          `Error confirming provider payment for session ${paymentRef}: ${errorMessage}`,
        );
        return res
          .status(HttpStatus.INTERNAL_SERVER_ERROR)
          .send('Error processing payment confirmation');
      }
    } else {
      // Ignoramos otros eventos (ej: payment_intent.created) y devolvemos 200 para que Stripe deje de intentarlo
      this.logger.verbose(`Ignored Stripe event: ${event.type}`);
    }

    // Respuesta 200 OK rápida y obligatoria para Stripe
    return res.status(HttpStatus.OK).json({ received: true });
  }
}
