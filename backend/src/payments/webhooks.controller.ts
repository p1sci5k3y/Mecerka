import {
  Controller,
  Post,
  Req,
  Res,
  Headers,
  Logger,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import Stripe from 'stripe';
import { PaymentsService } from './payments.service';

// Requerimos que la request contenga la propiedad rawBody, inyectada por NestFactory({rawBody: true})
interface RequestWithRawBody extends Request {
  rawBody: Buffer;
}

@Controller('webhooks/stripe')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;

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
      apiVersion: '2026-02-25.clover' as any,
    });
    this.webhookSecret = webhookKey;
  }

  @Post()
  async handleStripeWebhook(
    @Req() req: RequestWithRawBody,
    @Res() res: any,
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
    } catch (err: any) {
      this.logger.error(
        `Webhook signature verification failed: ${err.message}`,
      );
      // Return a generic error to the client while logging the detailed exception internally
      return res
        .status(HttpStatus.BAD_REQUEST)
        .send(`Webhook verification failed`);
    }

    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object;

      const orderId = paymentIntent.metadata?.orderId;
      const paymentRef = paymentIntent.id;

      if (!orderId) {
        this.logger.warn(
          `payment_intent.succeeded missing orderId in metadata (Ref: ${paymentRef})`,
        );
        return res.status(HttpStatus.OK).json({ received: true });
      }

      // Idempotency check: short-circuit duplicate events
      if (await this.paymentsService.isProcessed(event.id)) {
        this.logger.debug(`Webhook event ${event.id} already processed.`);
        return res.status(HttpStatus.OK).json({ received: true });
      }

      try {
        const result: any = await this.paymentsService.confirmPayment(
          orderId,
          paymentRef,
          event.id,
        );
        this.logger.log(
          `Order ${orderId} confirmed via Webhook! Ref: ${paymentRef}. Status: ${result.status}`,
        );
      } catch (error: any) {
        // Ignore known concurrent errors if already processed successfully by an overlapping webhook
        if (
          error.status === 409 ||
          error.message.includes('Concurrent stock update detected')
        ) {
          this.logger.warn(
            `Ignored concurrent retry or conflict for order ${orderId}: ${error.message}`,
          );
          return res.status(HttpStatus.OK).json({ received: true });
        }

        // Stripe requires a 500 status on unhandled backend errors so it can retry later
        this.logger.error(
          `Error confirming payment for order ${orderId}: ${error.message}`,
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
