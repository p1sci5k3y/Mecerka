import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrderItemsService } from './order-items.service';
import { OrderStatusService } from './order-status.service';
import { OrdersController } from './orders.controller';
import { GeocodingModule } from '../geocoding/geocoding.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RiskModule } from '../risk/risk.module';

@Module({
  imports: [PrismaModule, RiskModule, GeocodingModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderItemsService, OrderStatusService],
  exports: [OrdersService, OrderStatusService],
})
export class OrdersModule {}
