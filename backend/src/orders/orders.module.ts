import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { GeocodingModule } from '../geocoding/geocoding.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RiskModule } from '../risk/risk.module';
import { IOrderRepository } from './repositories/order.repository.interface';
import { PrismaOrderRepository } from './repositories/prisma-order.repository';

@Module({
  imports: [PrismaModule, RiskModule, GeocodingModule],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    { provide: IOrderRepository, useClass: PrismaOrderRepository },
  ],
  exports: [OrdersService],
})
export class OrdersModule {}
