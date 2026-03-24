import { ForbiddenException } from '@nestjs/common';
import { DevPaymentsController } from './dev-payments.controller';

describe('DevPaymentsController', () => {
  const env = process.env;
  let controller: DevPaymentsController;
  let paymentsServiceMock: {
    confirmPayment: jest.Mock;
  };

  beforeEach(() => {
    jest.restoreAllMocks();
    process.env = { ...env };
    paymentsServiceMock = {
      confirmPayment: jest.fn().mockResolvedValue({ status: 'CONFIRMED' }),
    };
    controller = new DevPaymentsController(paymentsServiceMock as never);
  });

  afterAll(() => {
    process.env = env;
  });

  it('rejects fake pay outside fake mode', async () => {
    process.env.PAYMENT_PROVIDER = 'stripe';
    process.env.NODE_ENV = 'development';
    process.env.DEV_PAYMENT_SECRET = 'secret';

    await expect(
      controller.fakePay('4d1f0d46-1d89-4a80-81f8-3f909cbfcb7a', 'secret'),
    ).rejects.toThrow(
      new ForbiddenException(
        'Dev payment only available in fake mode outside production',
      ),
    );
  });

  it('rejects fake pay in production even in fake mode', async () => {
    process.env.PAYMENT_PROVIDER = 'fake';
    process.env.NODE_ENV = 'production';
    process.env.DEV_PAYMENT_SECRET = 'secret';

    await expect(
      controller.fakePay('4d1f0d46-1d89-4a80-81f8-3f909cbfcb7a', 'secret'),
    ).rejects.toThrow(
      new ForbiddenException(
        'Dev payment only available in fake mode outside production',
      ),
    );
  });

  it('rejects missing or invalid dev secret', async () => {
    process.env.PAYMENT_PROVIDER = 'fake';
    process.env.NODE_ENV = 'development';
    process.env.DEV_PAYMENT_SECRET = 'expected';

    await expect(
      controller.fakePay('4d1f0d46-1d89-4a80-81f8-3f909cbfcb7a', 'wrong'),
    ).rejects.toThrow(new ForbiddenException('Missing/invalid dev secret'));
  });

  it('confirms payment when fake mode and secret are valid', async () => {
    jest.spyOn(Date, 'now').mockReturnValueOnce(101).mockReturnValueOnce(202);
    process.env.PAYMENT_PROVIDER = 'fake';
    process.env.NODE_ENV = 'development';
    process.env.DEV_PAYMENT_SECRET = 'expected';

    const result = await controller.fakePay(
      '4d1f0d46-1d89-4a80-81f8-3f909cbfcb7a',
      'expected',
    );

    expect(paymentsServiceMock.confirmPayment).toHaveBeenCalledWith(
      '4d1f0d46-1d89-4a80-81f8-3f909cbfcb7a',
      'fake_101',
      'dev_evt_202',
    );
    expect(result).toEqual({ status: 'CONFIRMED' });
  });
});
