import Stripe from 'stripe';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DonationStatus,
  PaymentAccountProvider,
  PaymentSessionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SupportService } from './support.service';

jest.mock('stripe');

describe('SupportService', () => {
  let service: SupportService;
  let prismaMock: any;
  let stripePaymentIntentsCreate: jest.Mock;
  let stripePaymentIntentsRetrieve: jest.Mock;
  let configGetMock: jest.Mock;

  beforeEach(async () => {
    stripePaymentIntentsCreate = jest.fn().mockResolvedValue({
      id: 'pi_donation_123',
      client_secret: 'pi_donation_123_secret',
      livemode: false,
    });
    stripePaymentIntentsRetrieve = jest.fn().mockResolvedValue({
      id: 'pi_donation_existing',
      client_secret: 'pi_donation_existing_secret',
    });

    (Stripe as unknown as jest.Mock).mockImplementation(() => ({
      paymentIntents: {
        create: stripePaymentIntentsCreate,
        retrieve: stripePaymentIntentsRetrieve,
      },
    }));

    prismaMock = {
      platformDonation: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      donationSession: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      donationWebhookEvent: {
        create: jest.fn(),
        update: jest.fn(),
      },
      order: {
        findUnique: jest.fn(),
      },
      providerOrder: {
        findUnique: jest.fn(),
      },
      providerPaymentSession: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    configGetMock = jest.fn((key: string) => {
      const values: Record<string, string> = {
        STRIPE_SECRET_KEY: 'sk_test_dummy',
        DONATIONS_ENABLED: 'true',
        DONATIONS_STRIPE_ENABLED: 'true',
        DONATIONS_SUPPORTED_CURRENCIES: 'EUR',
        DONATIONS_MIN_AMOUNT: '1',
        DONATIONS_MAX_AMOUNT: '500',
      };

      return values[key];
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupportService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: ConfigService,
          useValue: {
            get: configGetMock,
          },
        },
      ],
    }).compile();

    service = module.get<SupportService>(SupportService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('creates a donation isolated from marketplace orders', async () => {
    prismaMock.platformDonation.create.mockResolvedValue({
      id: 'donation-1',
      amount: 10,
      currency: 'EUR',
      donorUserId: 'user-1',
      provider: PaymentAccountProvider.STRIPE,
      status: DonationStatus.CREATED,
    });

    const result = await service.createDonation('10.00', 'eur', 'user-1');

    expect(prismaMock.platformDonation.create).toHaveBeenCalledWith({
      data: {
        amount: 10,
        currency: 'EUR',
        donorUserId: 'user-1',
        provider: PaymentAccountProvider.STRIPE,
        status: DonationStatus.CREATED,
      },
    });
    expect(prismaMock.order.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.providerOrder.findUnique).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        id: 'donation-1',
        status: DonationStatus.CREATED,
      }),
    );
  });

  it('rejects donation creation when donations are disabled', async () => {
    configGetMock.mockImplementation((key: string) => {
      if (key === 'DONATIONS_ENABLED') return 'false';
      if (key === 'STRIPE_SECRET_KEY') return 'sk_test_dummy';
      if (key === 'DONATIONS_STRIPE_ENABLED') return 'true';
      if (key === 'DONATIONS_SUPPORTED_CURRENCIES') return 'EUR';
      if (key === 'DONATIONS_MIN_AMOUNT') return '1';
      if (key === 'DONATIONS_MAX_AMOUNT') return '500';
      return undefined;
    });

    await expect(service.createDonation('10', 'EUR')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('rejects invalid donation amounts and unsupported currency', async () => {
    await expect(service.createDonation('0', 'EUR')).rejects.toThrow(
      'Donation amount must be greater than zero',
    );
    await expect(service.createDonation('600', 'EUR')).rejects.toThrow(
      'Donation amount must be at most 500.00',
    );
    await expect(service.createDonation('10', 'USD')).rejects.toThrow(
      'Unsupported donation currency',
    );
  });

  it('generates a retry-safe donation payment session', async () => {
    const transactionDonationFindUnique = jest.fn().mockResolvedValue({
      id: 'donation-1',
      amount: 10,
      currency: 'EUR',
      donorUserId: 'user-1',
      provider: PaymentAccountProvider.STRIPE,
      status: DonationStatus.CREATED,
      sessions: [],
    });
    const transactionSessionCreate = jest.fn().mockResolvedValue({
      id: 'session-1',
    });
    const transactionDonationUpdate = jest.fn().mockResolvedValue({});

    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        $executeRaw: jest.fn(),
        platformDonation: {
          findUnique: transactionDonationFindUnique,
          update: transactionDonationUpdate,
        },
        donationSession: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          create: transactionSessionCreate,
        },
      }),
    );

    const result = await service.prepareDonationPayment('donation-1', 'user-1');

    expect(stripePaymentIntentsCreate).toHaveBeenCalledWith({
      amount: 1000,
      currency: 'eur',
      automatic_payment_methods: { enabled: true },
      metadata: {
        donationId: 'donation-1',
      },
    });
    expect(transactionSessionCreate).toHaveBeenCalledWith({
      data: {
        donationId: 'donation-1',
        paymentProvider: PaymentAccountProvider.STRIPE,
        externalSessionId: 'pi_donation_123',
        paymentUrl: null,
        status: PaymentSessionStatus.READY,
        expiresAt: expect.any(Date),
        providerMetadata: {
          livemode: false,
          paymentIntentId: 'pi_donation_123',
        },
      },
    });
    expect(result).toEqual(
      expect.objectContaining({
        donationId: 'donation-1',
        donationSessionId: 'session-1',
        externalSessionId: 'pi_donation_123',
        clientSecret: 'pi_donation_123_secret',
        status: DonationStatus.READY,
      }),
    );
  });

  it('reuses an active donation session instead of creating a new one', async () => {
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        $executeRaw: jest.fn(),
        platformDonation: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'donation-1',
            amount: 10,
            currency: 'EUR',
            donorUserId: 'user-1',
            provider: PaymentAccountProvider.STRIPE,
            status: DonationStatus.READY,
            sessions: [
              {
                id: 'session-existing',
                externalSessionId: 'pi_donation_existing',
                status: PaymentSessionStatus.READY,
                expiresAt: new Date('2099-01-01T00:00:00.000Z'),
              },
            ],
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        donationSession: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          create: jest.fn(),
        },
      }),
    );

    const result = await service.prepareDonationPayment('donation-1', 'user-1');

    expect(stripePaymentIntentsCreate).not.toHaveBeenCalled();
    expect(stripePaymentIntentsRetrieve).toHaveBeenCalledWith(
      'pi_donation_existing',
    );
    expect(result).toEqual(
      expect.objectContaining({
        donationId: 'donation-1',
        donationSessionId: 'session-existing',
        externalSessionId: 'pi_donation_existing',
        clientSecret: 'pi_donation_existing_secret',
      }),
    );
  });

  it('confirms a donation payment with dedicated webhook idempotency and no order side effects', async () => {
    prismaMock.donationWebhookEvent.create.mockResolvedValue({ id: 'evt_1' });
    prismaMock.donationWebhookEvent.update.mockResolvedValue({});
    const transactionSessionUpdate = jest.fn().mockResolvedValue({});
    const transactionDonationUpdate = jest.fn().mockResolvedValue({});

    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        donationSession: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'session-1',
            donationId: 'donation-1',
            status: PaymentSessionStatus.READY,
            donation: {
              id: 'donation-1',
              status: DonationStatus.READY,
            },
          }),
          update: transactionSessionUpdate,
        },
        platformDonation: {
          update: transactionDonationUpdate,
        },
      }),
    );

    const result = await service.confirmDonationPayment('pi_donation_123', 'evt_1');

    expect(transactionSessionUpdate).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: {
        status: PaymentSessionStatus.COMPLETED,
      },
    });
    expect(transactionDonationUpdate).toHaveBeenCalledWith({
      where: { id: 'donation-1' },
      data: {
        status: DonationStatus.COMPLETED,
        externalRef: 'pi_donation_123',
      },
    });
    expect(prismaMock.donationWebhookEvent.update).toHaveBeenCalledWith({
      where: { id: 'evt_1' },
      data: {
        status: 'PROCESSED',
        processedAt: expect.any(Date),
      },
    });
    expect(prismaMock.order.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.providerOrder.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.providerPaymentSession.findUnique).not.toHaveBeenCalled();
    expect(result).toEqual({
      donationId: 'donation-1',
      status: DonationStatus.COMPLETED,
    });
  });

  it('ignores duplicate donation webhooks safely', async () => {
    prismaMock.donationWebhookEvent.create.mockRejectedValue({ code: 'P2002' });

    const result = await service.confirmDonationPayment('pi_donation_123', 'evt_dup');

    expect(result).toEqual({ message: 'Donation webhook already processed' });
  });

  it('marks failed donation webhooks without touching marketplace payments', async () => {
    prismaMock.donationWebhookEvent.create.mockResolvedValue({ id: 'evt_fail' });
    prismaMock.donationWebhookEvent.update.mockResolvedValue({});

    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        donationSession: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'session-1',
            donationId: 'donation-1',
            status: PaymentSessionStatus.READY,
            donation: {
              id: 'donation-1',
              status: DonationStatus.READY,
            },
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        platformDonation: {
          update: jest.fn().mockResolvedValue({}),
        },
      }),
    );

    const result = await service.failDonationPayment('pi_donation_123', 'evt_fail');

    expect(prismaMock.donationWebhookEvent.update).toHaveBeenCalledWith({
      where: { id: 'evt_fail' },
      data: {
        status: 'PROCESSED',
        processedAt: expect.any(Date),
      },
    });
    expect(prismaMock.providerPaymentSession.findUnique).not.toHaveBeenCalled();
    expect(result).toEqual({
      donationId: 'donation-1',
      status: DonationStatus.FAILED,
    });
  });

  it('does not let one user read another donor donation', async () => {
    prismaMock.platformDonation.findUnique.mockResolvedValue({
      id: 'donation-1',
      donorUserId: 'user-owner',
      sessions: [],
    });

    await expect(service.getDonation('donation-1', 'user-other')).rejects.toThrow(
      'You do not have access to this donation',
    );
  });

  it('rejects anonymous retrieval through the authenticated endpoint flow', async () => {
    prismaMock.platformDonation.findUnique.mockResolvedValue({
      id: 'donation-1',
      donorUserId: null,
      sessions: [],
    });

    await expect(service.getDonation('donation-1')).rejects.toThrow(
      'Anonymous donations cannot be retrieved through this endpoint',
    );
  });

  it('marks webhook audit rows as failed when confirmation throws', async () => {
    prismaMock.donationWebhookEvent.create.mockResolvedValue({ id: 'evt_error' });
    prismaMock.donationWebhookEvent.update.mockResolvedValue({});
    prismaMock.$transaction.mockRejectedValue(new Error('db-failure'));

    await expect(
      service.confirmDonationPayment('pi_donation_123', 'evt_error'),
    ).rejects.toThrow('db-failure');

    expect(prismaMock.donationWebhookEvent.update).toHaveBeenCalledWith({
      where: { id: 'evt_error' },
      data: {
        status: 'FAILED',
        processedAt: expect.any(Date),
      },
    });
  });

  it('rejects invalid currency and out-of-range amount before session creation', async () => {
    await expect(service.createDonation(Number.NaN, 'EUR')).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.createDonation('0.5', 'EUR')).rejects.toThrow(
      'Donation amount must be at least 1.00',
    );
    await expect(service.createDonation('999', 'EUR')).rejects.toThrow(
      'Donation amount must be at most 500.00',
    );
    await expect(service.createDonation('10', 'usd')).rejects.toThrow(
      'Unsupported donation currency',
    );
  });
});
