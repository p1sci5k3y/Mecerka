import { MODULE_METADATA } from '@nestjs/common/constants';
import { PaymentsModule } from './payments.module';
import { OnboardingController } from './onboarding.controller';
import { PaymentsController } from './payments.controller';
import { WebhooksController } from './webhooks.controller';

describe('PaymentsModule wiring', () => {
  it('registers only the signed Stripe webhook controller for /webhooks/stripe', () => {
    const controllers =
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, PaymentsModule) ?? [];

    expect(controllers).toEqual([
      WebhooksController,
      OnboardingController,
      PaymentsController,
    ]);
  });
});
