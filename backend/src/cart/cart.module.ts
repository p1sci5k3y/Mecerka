import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { OrdersModule } from '../orders/orders.module';
import { CartProductPricingService } from './cart-product-pricing.service';

@Module({
  imports: [PrismaModule, OrdersModule],
  controllers: [CartController],
  providers: [CartService, CartProductPricingService],
  exports: [CartService],
})
export class CartModule {}
