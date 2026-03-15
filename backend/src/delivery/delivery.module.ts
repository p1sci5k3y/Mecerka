import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { DeliveryController } from './delivery.controller';
import { DeliveryService } from './delivery.service';
import { DeliveryWebhooksController } from './delivery-webhooks.controller';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [DeliveryController, DeliveryWebhooksController],
  providers: [DeliveryService],
  exports: [DeliveryService],
})
export class DeliveryModule {}
