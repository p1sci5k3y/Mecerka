import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
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
import { DemoModule } from './demo/demo.module';
import { AppLoggerService } from './common/logging/app-logger.service';
import { RequestLoggingInterceptor } from './common/logging/request-logging.interceptor';
import { RequestIdMiddleware } from './common/logging/request-id.middleware';
import { E2eAwareThrottlerGuard } from './common/guards/e2e-throttler.guard';
import { SeedModule } from './seed/seed.module';
import { validateEnvironment } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env'],
      validate: validateEnvironment,
    }),
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
    SeedModule,
    DemoModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    AppLoggerService,
    {
      provide: APP_GUARD,
      useClass: E2eAwareThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestLoggingInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
