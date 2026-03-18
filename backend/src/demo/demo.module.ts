import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { AuthModule } from '../auth/auth.module';
import { CartModule } from '../cart/cart.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductsModule } from '../products/products.module';
import { SeedModule } from '../seed/seed.module';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    AdminModule,
    ProductsModule,
    OrdersModule,
    DeliveryModule,
    CartModule,
    PaymentsModule,
    SeedModule,
  ],
  controllers: [DemoController],
  providers: [DemoService],
})
export class DemoModule {}
