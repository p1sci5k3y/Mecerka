import { BadRequestException } from '@nestjs/common';
import { OnboardingController } from './onboarding.controller';

describe('OnboardingController', () => {
  let controller: OnboardingController;
  let paymentsServiceMock: {
    generateOnboardingLink: jest.Mock;
    verifyAndSaveConnectedAccount: jest.Mock;
  };

  beforeEach(() => {
    paymentsServiceMock = {
      generateOnboardingLink: jest
        .fn()
        .mockResolvedValue('https://connect.stripe.test/onboarding'),
      verifyAndSaveConnectedAccount: jest.fn().mockResolvedValue(undefined),
    };
    controller = new OnboardingController(paymentsServiceMock as never);
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.FRONTEND_URL;
  });

  it('delegates onboarding link generation for the authenticated user', async () => {
    const req = { user: { userId: 'provider-1' } };

    const result = await controller.getConnectLink(req as never);

    expect(paymentsServiceMock.generateOnboardingLink).toHaveBeenCalledWith(
      'provider-1',
    );
    expect(result).toEqual({
      url: 'https://connect.stripe.test/onboarding',
    });
  });

  it('rejects callback requests without accountId', async () => {
    const req = { user: { userId: 'provider-1' } };
    const res = { redirect: jest.fn() };

    await expect(
      controller.handleStripeCallback(req as never, '' as never, res as never),
    ).rejects.toThrow(BadRequestException);
  });

  it('redirects to the configured frontend on successful verification', async () => {
    process.env.FRONTEND_URL = 'https://mecerka.me';
    const req = { user: { userId: 'provider-1' } };
    const res = { redirect: jest.fn() };

    await controller.handleStripeCallback(
      req as never,
      'acct_connected',
      res as never,
    );

    expect(
      paymentsServiceMock.verifyAndSaveConnectedAccount,
    ).toHaveBeenCalledWith('provider-1', 'acct_connected');
    expect(res.redirect).toHaveBeenCalledWith(
      'https://mecerka.me/dashboard?stripe_connected=true',
    );
  });

  it('falls back to localhost and redirects with failure when verification throws', async () => {
    const req = { user: { userId: 'provider-1' } };
    const res = { redirect: jest.fn() };
    const loggerSpy = jest
      .spyOn(
        (
          controller as unknown as {
            logger: { error: (...args: unknown[]) => void };
          }
        ).logger,
        'error',
      )
      .mockImplementation(() => undefined);
    paymentsServiceMock.verifyAndSaveConnectedAccount.mockRejectedValueOnce(
      new Error('stripe verification failed'),
    );

    await controller.handleStripeCallback(
      req as never,
      'acct_connected',
      res as never,
    );

    expect(res.redirect).toHaveBeenCalledWith(
      'http://localhost:3001/dashboard?stripe_connected=false&error=verification_failed',
    );
    expect(loggerSpy).toHaveBeenCalled();
  });
});
