import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { RefundsController } from './refunds.controller';
import { RefundsService } from './refunds.service';
import { RiskModule } from '../risk/risk.module';

@Module({
  imports: [ConfigModule, PrismaModule, RiskModule],
  controllers: [RefundsController],
  providers: [RefundsService],
})
export class RefundsModule {}
