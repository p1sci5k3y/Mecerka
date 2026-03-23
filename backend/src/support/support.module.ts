import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { SupportController } from './support.controller';
import { DonationPaymentService } from './donation-payment.service';
import { SupportService } from './support.service';
import { SupportWebhooksController } from './support-webhooks.controller';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [SupportController, SupportWebhooksController],
  providers: [SupportService, DonationPaymentService],
  exports: [SupportService],
})
export class SupportModule {}
