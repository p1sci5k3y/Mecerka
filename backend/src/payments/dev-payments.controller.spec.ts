import { ForbiddenException } from '@nestjs/common';
import { DevPaymentsController } from './dev-payments.controller';

describe('DevPaymentsController', () => {
  const env = process.env;
  let controller: DevPaymentsController;
  let paymentsServiceMock: {
    confirmPayment: jest.Mock;
  };

  beforeEach(() => {
    process.env = { ...env };
    paymentsServiceMock = {
      confirmPayment: jest.fn().mockResolvedValue({ ok: true }),
    };
    controller = new DevPaymentsController(paymentsServiceMock as never);
  });

  afterAll(() => {
    process.env = env;
  });

  it('rejects dev payments outside fake mode or in production', async () => {
    process.env.PAYMENT_PROVIDER = 'stripe';
    process.env.NODE_ENV = 'development';

    await expect(
      controller.fakePay('9c1fc56f-d632-4cb0-b01e-e907c3e54eb4', 'secret'),
    ).rejects.toThrow(ForbiddenException);

    process.env.PAYMENT_PROVIDER = 'fake';
    process.env.NODE_ENV = 'production';

    await expect(
      controller.fakePay('9c1fc56f-d632-4cb0-b01e-e907c3e54eb4', 'secret'),
    ).rejects.toThrow(
      'Dev payment only available in fake mode outside production',
    );
  });

  it('rejects missing or invalid shared secrets', async () => {
    process.env.PAYMENT_PROVIDER = 'fake';
    process.env.NODE_ENV = 'development';
    process.env.DEV_PAYMENT_SECRET = 'expected-secret';

    await expect(
      controller.fakePay(
        '9c1fc56f-d632-4cb0-b01e-e907c3e54eb4',
        'wrong-secret',
      ),
    ).rejects.toThrow('Missing/invalid dev secret');
  });

  it('confirms the payment in fake mode when the secret matches', async () => {
    process.env.PAYMENT_PROVIDER = 'fake';
    process.env.NODE_ENV = 'development';
    process.env.DEV_PAYMENT_SECRET = 'expected-secret';

    const result = await controller.fakePay(
      '9c1fc56f-d632-4cb0-b01e-e907c3e54eb4',
      'expected-secret',
    );

    expect(paymentsServiceMock.confirmPayment).toHaveBeenCalledWith(
      '9c1fc56f-d632-4cb0-b01e-e907c3e54eb4',
      expect.stringMatching(/^fake_/),
      expect.stringMatching(/^dev_evt_/),
    );
    expect(result).toEqual({ ok: true });
  });
});
