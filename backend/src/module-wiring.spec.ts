import 'reflect-metadata';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { MODULE_METADATA } from '@nestjs/common/constants';
jest.mock('./auth/mfa.service', () => ({
  MfaService: class MfaService {},
}));

import { AppModule } from './app.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppLoggerService } from './common/logging/app-logger.service';
import { RequestIdMiddleware } from './common/logging/request-id.middleware';
import { RequestLoggingInterceptor } from './common/logging/request-logging.interceptor';
import { E2eAwareThrottlerGuard } from './common/guards/e2e-throttler.guard';
import { AuthModule } from './auth/auth.module';
import { CartModule } from './cart/cart.module';
import { CategoriesModule } from './categories/categories.module';
import { CitiesModule } from './cities/cities.module';
import { DeliveryModule } from './delivery/delivery.module';
import { DemoModule } from './demo/demo.module';
import { EmailModule } from './email/email.module';
import { ObservabilityModule } from './observability/observability.module';
import { ProductsModule } from './products/products.module';
import { ProvidersModule } from './providers/providers.module';
import { RefundsModule } from './refunds/refunds.module';
import { RunnerModule } from './runner/runner.module';
import { SeedModule } from './seed/seed.module';
import { SupportModule } from './support/support.module';

describe('Module wiring', () => {
  it('registers core application controllers, providers, and middleware', () => {
    const controllers = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      AppModule,
    );
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AppModule);
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule);
    const consumer = {
      apply: jest.fn().mockReturnValue({
        forRoutes: jest.fn(),
      }),
    };

    new AppModule().configure(consumer as never);

    expect(controllers).toEqual([AppController]);
    expect(providers).toEqual(
      expect.arrayContaining([
        AppService,
        AppLoggerService,
        expect.objectContaining({
          provide: APP_GUARD,
          useClass: E2eAwareThrottlerGuard,
        }),
        expect.objectContaining({
          provide: APP_INTERCEPTOR,
          useClass: RequestLoggingInterceptor,
        }),
      ]),
    );
    expect(imports).toEqual(
      expect.arrayContaining([
        CitiesModule,
        CategoriesModule,
        AuthModule,
        ProductsModule,
        CartModule,
        ProvidersModule,
        DeliveryModule,
        RefundsModule,
        RunnerModule,
        SupportModule,
        EmailModule,
        SeedModule,
        DemoModule,
        ObservabilityModule,
      ]),
    );
    expect(consumer.apply).toHaveBeenCalledWith(RequestIdMiddleware);
    expect(
      consumer.apply.mock.results[0]?.value.forRoutes,
    ).toHaveBeenCalledWith('*');
  });
});
