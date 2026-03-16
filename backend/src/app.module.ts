import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { CitiesModule } from './cities/cities.module';
import { CategoriesModule } from './categories/categories.module';
import { AuthModule } from './auth/auth.module';
import { ProductsModule } from './products/products.module';
import { OrdersModule } from './orders/orders.module';
import { AdminModule } from './admin/admin.module';
import { EmailModule } from './email/email.module';
import { RunnerModule } from './runner/runner.module';
import { UsersModule } from './users/app-users.module';
import { PaymentsModule } from './payments/payments.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ProvidersModule } from './providers/providers.module';
import { CartModule } from './cart/cart.module';
import { SupportModule } from './support/support.module';
import { DeliveryModule } from './delivery/delivery.module';
import { RefundsModule } from './refunds/refunds.module';
import { RiskModule } from './risk/risk.module';
import { ObservabilityModule } from './observability/observability.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }), // Makes ConfigService injectable across all modules
    EventEmitterModule.forRoot(),
    PrismaModule,
    CitiesModule,
    CategoriesModule,
    AuthModule,
    ProductsModule,
    OrdersModule,
    AdminModule,
    EmailModule,
    RunnerModule,
    UsersModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 10,
      },
    ]),
    PaymentsModule,
    ProvidersModule,
    CartModule,
    SupportModule,
    DeliveryModule,
    RefundsModule,
    RiskModule,
    ObservabilityModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
