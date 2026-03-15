import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';
import { SupportWebhooksController } from './support-webhooks.controller';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [SupportController, SupportWebhooksController],
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportModule {}
