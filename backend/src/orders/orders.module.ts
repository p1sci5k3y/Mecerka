import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrderQueryService } from './order-query.service';
import { OrderItemsService } from './order-items.service';
import { OrderStatusService } from './order-status.service';
import { CheckoutService } from './checkout.service';
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
    OrderQueryService,
    OrderItemsService,
    OrderStatusService,
    CheckoutService,
    { provide: IOrderRepository, useClass: PrismaOrderRepository },
  ],
  exports: [OrdersService, OrderStatusService],
})
export class OrdersModule {}
