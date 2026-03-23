import Stripe from 'stripe';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PaymentAccountOwnerType,
  PaymentAccountProvider,
  Role,
} from '@prisma/client';
import { PaymentAccountOnboardingService } from './payment-account-onboarding.service';

describe('PaymentAccountOnboardingService', () => {
  let service: PaymentAccountOnboardingService;
  let prismaMock: {
    user: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let configServiceMock: { get: jest.Mock };
  let paymentAccountRepositoryMock: { upsert: jest.Mock };
  let stripeAccountsCreate: jest.Mock;
  let stripeAccountsRetrieve: jest.Mock;
  let stripeAccountLinksCreate: jest.Mock;

  beforeEach(() => {
    prismaMock = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    configServiceMock = {
      get: jest.fn((key: string) => {
        if (key === 'FRONTEND_URL') return 'https://frontend.test';
        if (key === 'BACKEND_URL') return 'https://backend.test';
        return undefined;
      }),
    };
    paymentAccountRepositoryMock = {
      upsert: jest.fn(),
    };
    stripeAccountsCreate = jest.fn();
    stripeAccountsRetrieve = jest.fn();
    stripeAccountLinksCreate = jest.fn();

    service = new PaymentAccountOnboardingService(
      prismaMock as never,
      configServiceMock as unknown as ConfigService,
      {
        accounts: {
          create: stripeAccountsCreate,
          retrieve: stripeAccountsRetrieve,
        },
        accountLinks: {
          create: stripeAccountLinksCreate,
        },
      } as unknown as Stripe,
      paymentAccountRepositoryMock as never,
    );
  });

  it('creates a Stripe account, persists it and returns the onboarding link for a provider', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'provider-1',
      email: 'provider@example.test',
      roles: [Role.PROVIDER],
      stripeAccountId: null,
    });
    stripeAccountsCreate.mockResolvedValue({ id: 'acct_provider_1' });
    stripeAccountLinksCreate.mockResolvedValue({
      url: 'https://connect.stripe.test/link',
    });

    const result = await service.generateOnboardingLink('provider-1');

    expect(stripeAccountsCreate).toHaveBeenCalledWith({
      type: 'express',
      email: 'provider@example.test',
      capabilities: {
        transfers: { requested: true },
      },
      business_type: 'individual',
    });
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'provider-1' },
      data: { stripeAccountId: 'acct_provider_1' },
    });
    expect(paymentAccountRepositoryMock.upsert).toHaveBeenCalledWith(
      PaymentAccountOwnerType.PROVIDER,
      'provider-1',
      PaymentAccountProvider.STRIPE,
      'acct_provider_1',
    );
    expect(stripeAccountLinksCreate).toHaveBeenCalledWith({
      account: 'acct_provider_1',
      refresh_url: 'https://frontend.test/dashboard?stripe_connected=refresh',
      return_url:
        'https://backend.test/payments/connect/callback?accountId=acct_provider_1',
      type: 'account_onboarding',
    });
    expect(result).toBe('https://connect.stripe.test/link');
  });

  it('reuses an existing connected account when generating a link', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'runner-1',
      email: 'runner@example.test',
      roles: [Role.RUNNER],
      stripeAccountId: 'acct_runner_1',
    });
    stripeAccountLinksCreate.mockResolvedValue({
      url: 'https://connect.stripe.test/runner-link',
    });

    const result = await service.generateOnboardingLink('runner-1');

    expect(stripeAccountsCreate).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(paymentAccountRepositoryMock.upsert).not.toHaveBeenCalled();
    expect(stripeAccountLinksCreate).toHaveBeenCalledWith({
      account: 'acct_runner_1',
      refresh_url: 'https://frontend.test/dashboard?stripe_connected=refresh',
      return_url:
        'https://backend.test/payments/connect/callback?accountId=acct_runner_1',
      type: 'account_onboarding',
    });
    expect(result).toBe('https://connect.stripe.test/runner-link');
  });

  it('rejects onboarding for unknown users', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(
      service.generateOnboardingLink('missing-user'),
    ).rejects.toThrow(NotFoundException);

    expect(stripeAccountsCreate).not.toHaveBeenCalled();
    expect(stripeAccountLinksCreate).not.toHaveBeenCalled();
  });

  it('verifies the connected account and activates the repository record for a runner', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'runner-1',
      email: 'runner@example.test',
      roles: [Role.RUNNER],
      stripeAccountId: 'acct_runner_1',
    });
    stripeAccountsRetrieve.mockResolvedValue({
      id: 'acct_runner_1',
      details_submitted: true,
    });

    await expect(
      service.verifyAndSaveConnectedAccount('runner-1', 'acct_runner_1'),
    ).resolves.toBe(true);

    expect(paymentAccountRepositoryMock.upsert).toHaveBeenCalledWith(
      PaymentAccountOwnerType.RUNNER,
      'runner-1',
      PaymentAccountProvider.STRIPE,
      'acct_runner_1',
    );
  });

  it('rejects callback verification when the stored account does not match', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'provider-1',
      email: 'provider@example.test',
      roles: [Role.PROVIDER],
      stripeAccountId: 'acct_provider_1',
    });

    await expect(
      service.verifyAndSaveConnectedAccount('provider-1', 'acct_other'),
    ).rejects.toThrow(ConflictException);

    expect(stripeAccountsRetrieve).not.toHaveBeenCalled();
  });

  it('rejects callback verification while onboarding is incomplete', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'provider-1',
      email: 'provider@example.test',
      roles: [Role.PROVIDER],
      stripeAccountId: 'acct_provider_1',
    });
    stripeAccountsRetrieve.mockResolvedValue({
      id: 'acct_provider_1',
      details_submitted: false,
    });

    await expect(
      service.verifyAndSaveConnectedAccount('provider-1', 'acct_provider_1'),
    ).rejects.toThrow(ConflictException);

    expect(paymentAccountRepositoryMock.upsert).not.toHaveBeenCalled();
  });
});
