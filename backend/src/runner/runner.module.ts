import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RunnerService } from './runner.service';
import { RunnerController } from './runner.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { RunnerGateway } from './runner.gateway';

import { OrdersModule } from '../orders/orders.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [ConfigModule, PrismaModule, OrdersModule, AuthModule],
  controllers: [RunnerController],
  providers: [RunnerService, RunnerGateway],
})
export class RunnerModule { }
