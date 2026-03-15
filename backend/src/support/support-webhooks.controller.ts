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
import { SupportService } from './support.service';

interface RequestWithRawBody extends Request {
  rawBody: Buffer;
}

@SkipThrottle()
@Controller('support/webhooks/stripe')
export class SupportWebhooksController {
  private readonly logger = new Logger(SupportWebhooksController.name);

  constructor(
    private readonly supportService: SupportService,
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
      'DONATIONS_STRIPE_WEBHOOK_SECRET',
    );

    if (!stripeSecretKey || !webhookSecret) {
      return res
        .status(HttpStatus.SERVICE_UNAVAILABLE)
        .send('Donation webhook support is disabled');
    }

    if (!signature) {
      this.logger.error('Missing stripe-signature header on donation webhook');
      return res.status(HttpStatus.BAD_REQUEST).send('Missing signature');
    }

    if (!req.rawBody) {
      this.logger.error('Missing raw body for donation webhook');
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
      this.logger.error('Donation webhook signature verification failed');
      return res
        .status(HttpStatus.BAD_REQUEST)
        .send('Webhook verification failed');
    }

    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    const externalSessionId = paymentIntent.id;

    try {
      if (event.type === 'payment_intent.succeeded') {
        const result = await this.supportService.confirmDonationPayment(
          externalSessionId,
          event.id,
        );
        const status = 'status' in result ? result.status : 'IGNORED';
        this.logger.log(
          `Donation webhook processed: event=${event.id} session=${externalSessionId} status=${status}`,
        );
      } else if (event.type === 'payment_intent.payment_failed') {
        const result = await this.supportService.failDonationPayment(
          externalSessionId,
          event.id,
        );
        const status = 'status' in result ? result.status : 'IGNORED';
        this.logger.log(
          `Donation webhook processed: event=${event.id} session=${externalSessionId} status=${status}`,
        );
      } else {
        this.logger.verbose(
          `Ignored donation Stripe event ${event.id} of type ${event.type}`,
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Donation webhook failed: event=${event.id} session=${externalSessionId} message=${error.message}`,
      );
      return res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .send('Error processing donation webhook');
    }

    return res.status(HttpStatus.OK).json({ received: true });
  }
}
