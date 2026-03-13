import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WebhooksController } from './webhooks.controller';
import { OnboardingController } from './onboarding.controller';
import { PaymentsController } from './payments.controller';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsService } from './payments.service';

@Module({
  imports: [ConfigModule, OrdersModule],
  controllers: [
    WebhooksController,
    OnboardingController,
    PaymentsController,
  ],
  providers: [PaymentsService],
})
export class PaymentsModule {}
