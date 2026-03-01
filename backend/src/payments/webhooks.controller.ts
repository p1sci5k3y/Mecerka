import { Controller, Post, Req, Res, Headers, Logger, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import Stripe from 'stripe';
import { OrdersService } from '../orders/orders.service';

// Requerimos que la request contenga la propiedad rawBody, inyectada por NestFactory({rawBody: true})
interface RequestWithRawBody extends Request {
    rawBody: Buffer;
}

@Controller('webhooks/stripe')
export class WebhooksController {
    private readonly logger = new Logger(WebhooksController.name);
    private readonly stripe: Stripe;
    private readonly webhookSecret: string;

    constructor(private readonly ordersService: OrdersService) {
        // Ideally this comes from a ConfigService
        this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder', {
            apiVersion: '2026-02-25.clover', // Latest or matching project version
        });
        this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_placeholder';
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
            this.logger.error('Missing raw body in request. Ensure rawBody: true is enabled in main.ts');
            return res.status(HttpStatus.BAD_REQUEST).send('Missing raw body');
        }

        let event: Stripe.Event;

        try {
            event = this.stripe.webhooks.constructEvent(req.rawBody, signature, this.webhookSecret);
        } catch (err: any) {
            this.logger.error(`Webhook signature verification failed: ${err.message}`);
            return res.status(HttpStatus.BAD_REQUEST).send(`Webhook Error: ${err.message}`);
        }

        if (event.type === 'payment_intent.succeeded') {
            const paymentIntent = event.data.object as Stripe.PaymentIntent;

            const orderId = paymentIntent.metadata?.orderId;
            const paymentRef = paymentIntent.id;

            if (!orderId) {
                this.logger.warn(`payment_intent.succeeded missing orderId in metadata (Ref: ${paymentRef})`);
                return res.status(HttpStatus.OK).json({ received: true });
            }

            try {
                const result = await this.ordersService.confirmPayment(orderId, paymentRef);
                this.logger.log(
                    `Order ${orderId} confirmed via Stripe Webhook! Ref: ${paymentRef}. Status: ${result.finalStatus}`,
                );
            } catch (error: any) {
                // Stripe requires a 500 status on unhandled backend errors so it can retry later
                this.logger.error(`Error confirming payment for order ${orderId}: ${error.message}`);
                return res.status(HttpStatus.INTERNAL_SERVER_ERROR).send('Error processing payment confirmation');
            }
        } else {
            // Ignoramos otros eventos (ej: payment_intent.created) y devolvemos 200 para que Stripe deje de intentarlo
            this.logger.verbose(`Ignored Stripe event: ${event.type}`);
        }

        // Respuesta 200 OK rápida y obligatoria para Stripe
        return res.status(HttpStatus.OK).json({ received: true });
    }
}
