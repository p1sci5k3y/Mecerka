import Stripe from 'stripe';
import { Test, TestingModule } from '@nestjs/testing';
import {
  DonationStatus,
  PaymentAccountProvider,
  PaymentSessionStatus,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { DonationPaymentService } from './donation-payment.service';

jest.mock('stripe');

describe('DonationPaymentService', () => {
  let service: DonationPaymentService;
  let prismaMock: {
    platformDonation: { update: jest.Mock };
    donationSession: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    donationWebhookEvent: { create: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };
  let stripePaymentIntentsCreate: jest.Mock;
  let stripePaymentIntentsRetrieve: jest.Mock;

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
      platformDonation: { update: jest.fn() },
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
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DonationPaymentService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'STRIPE_SECRET_KEY' ? 'sk_test_dummy' : undefined,
            ),
          },
        },
      ],
    }).compile();

    service = module.get<DonationPaymentService>(DonationPaymentService);
  });

  it('reuses an active donation session instead of creating a new one', async () => {
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: Record<string, unknown>) => unknown) =>
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
    expect(result.donationSessionId).toBe('session-existing');
  });

  it('marks a confirmed donation webhook as processed', async () => {
    prismaMock.donationWebhookEvent.create.mockResolvedValue({ id: 'evt_1' });
    prismaMock.donationWebhookEvent.update.mockResolvedValue({});
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: Record<string, unknown>) => unknown) =>
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

    const result = await service.confirmDonationPayment(
      'pi_donation_123',
      'evt_1',
    );

    expect(result).toEqual({
      donationId: 'donation-1',
      status: DonationStatus.COMPLETED,
    });
    expect(prismaMock.donationWebhookEvent.update).toHaveBeenCalledWith({
      where: { id: 'evt_1' },
      data: {
        status: 'PROCESSED',
        processedAt: expect.any(Date),
      },
    });
  });
});
