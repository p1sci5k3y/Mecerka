import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WebhooksController } from './webhooks.controller';
import { PaymentWebhooksController } from './payment-webhooks.controller';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [ConfigModule, OrdersModule],
  controllers: [WebhooksController, PaymentWebhooksController],
})
export class PaymentsModule { }
