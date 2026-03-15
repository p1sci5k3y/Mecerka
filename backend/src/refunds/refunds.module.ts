import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { RefundsController } from './refunds.controller';
import { RefundsService } from './refunds.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [RefundsController],
  providers: [RefundsService],
})
export class RefundsModule {}
