import {
  Controller,
  Headers,
  HttpStatus,
  Logger,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import Stripe from 'stripe';
import { DeliveryService } from './delivery.service';

interface RequestWithRawBody extends Request {
  rawBody: Buffer;
}

@SkipThrottle()
@Controller('delivery/webhooks/stripe')
export class DeliveryWebhooksController {
  private readonly logger = new Logger(DeliveryWebhooksController.name);

  constructor(
    private readonly deliveryService: DeliveryService,
    private readonly configService: ConfigService,
  ) {}

  @Post()
  async handleStripeWebhook(
    @Req() req: RequestWithRawBody,
    @Res() res: any,
    @Headers('stripe-signature') signature: string,
  ) {
    const stripeSecretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    const webhookSecret = this.configService.get<string>(
      'DELIVERY_STRIPE_WEBHOOK_SECRET',
    );

    if (!stripeSecretKey || !webhookSecret) {
      return res
        .status(HttpStatus.SERVICE_UNAVAILABLE)
        .send('Delivery webhook support is disabled');
    }

    if (!signature) {
      this.logger.error('Missing stripe-signature header on delivery webhook');
      return res.status(HttpStatus.BAD_REQUEST).send('Missing signature');
    }

    if (!req.rawBody) {
      this.logger.error('Missing raw body for delivery webhook');
      return res.status(HttpStatus.BAD_REQUEST).send('Missing raw body');
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2026-02-25.clover',
    });

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        signature,
        webhookSecret,
      );
    } catch {
      this.logger.error('Delivery webhook signature verification failed');
      return res
        .status(HttpStatus.BAD_REQUEST)
        .send('Webhook verification failed');
    }

    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    const externalSessionId = paymentIntent.id;

    try {
      if (event.type === 'payment_intent.succeeded') {
        const result = await this.deliveryService.confirmRunnerPayment(
          externalSessionId,
          event.id,
        );
        const status =
          'paymentStatus' in result ? result.paymentStatus : 'IGNORED';
        this.logger.log(
          `Delivery webhook processed: event=${event.id} session=${externalSessionId} status=${status}`,
        );
      } else if (event.type === 'payment_intent.payment_failed') {
        const result = await this.deliveryService.failRunnerPayment(
          externalSessionId,
          event.id,
        );
        const status =
          'paymentStatus' in result ? result.paymentStatus : 'IGNORED';
        this.logger.log(
          `Delivery webhook processed: event=${event.id} session=${externalSessionId} status=${status}`,
        );
      } else {
        this.logger.verbose(
          `Ignored delivery Stripe event ${event.id} of type ${event.type}`,
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Delivery webhook failed: event=${event.id} session=${externalSessionId} message=${error.message}`,
      );
      return res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .send('Error processing delivery webhook');
    }

    return res.status(HttpStatus.OK).json({ received: true });
  }
}
