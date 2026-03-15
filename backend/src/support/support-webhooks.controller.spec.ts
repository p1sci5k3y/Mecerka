import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import Stripe from 'stripe';
import { SupportService } from './support.service';
import { SupportWebhooksController } from './support-webhooks.controller';

jest.mock('stripe');

describe('SupportWebhooksController', () => {
  let controller: SupportWebhooksController;
  let supportServiceMock: {
    confirmDonationPayment: jest.Mock;
    failDonationPayment: jest.Mock;
  };
  let configGetMock: jest.Mock;
  let constructEventMock: jest.Mock;

  beforeEach(async () => {
    constructEventMock = jest.fn();
    (Stripe as unknown as jest.Mock).mockImplementation(() => ({
      webhooks: {
        constructEvent: constructEventMock,
      },
    }));

    supportServiceMock = {
      confirmDonationPayment: jest
        .fn()
        .mockResolvedValue({ status: 'COMPLETED' }),
      failDonationPayment: jest.fn().mockResolvedValue({ status: 'FAILED' }),
    };

    configGetMock = jest.fn((key: string) => {
      const values: Record<string, string> = {
        STRIPE_SECRET_KEY: 'sk_test_dummy',
        DONATIONS_STRIPE_WEBHOOK_SECRET: 'whsec_test',
      };

      return values[key];
    });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SupportWebhooksController],
      providers: [
        { provide: SupportService, useValue: supportServiceMock },
        {
          provide: ConfigService,
          useValue: { get: configGetMock },
        },
      ],
    }).compile();

    controller = module.get<SupportWebhooksController>(SupportWebhooksController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('rejects invalid signatures', async () => {
    const req = { rawBody: Buffer.from('invalid') } as any;
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() } as any;

    constructEventMock.mockImplementation(() => {
      throw new Error('Invalid signature');
    });

    await controller.handleStripeWebhook(req, res, 'bad-sig');

    expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(res.send).toHaveBeenCalledWith('Webhook verification failed');
    expect(supportServiceMock.confirmDonationPayment).not.toHaveBeenCalled();
  });

  it('confirms succeeded payments through the isolated donation flow', async () => {
    const req = { rawBody: Buffer.from('valid') } as any;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
    const logSpy = jest.spyOn((controller as any).logger, 'log');

    constructEventMock.mockReturnValue({
      id: 'evt_donation_1',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_donation_1',
          client_secret: 'pi_donation_secret_should_not_log',
        },
      },
    });

    await controller.handleStripeWebhook(req, res, 'valid-sig');

    expect(supportServiceMock.confirmDonationPayment).toHaveBeenCalledWith(
      'pi_donation_1',
      'evt_donation_1',
    );
    expect(logSpy).toHaveBeenCalledWith(
      'Donation webhook processed: event=evt_donation_1 session=pi_donation_1 status=COMPLETED',
    );
    expect(logSpy.mock.calls[0]?.[0]).not.toContain('client_secret');
    expect(logSpy.mock.calls[0]?.[0]).not.toContain('authorization');
    expect(logSpy.mock.calls[0]?.[0]).not.toContain('pi_donation_secret_should_not_log');
    expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });

  it('marks failed payments through the isolated donation flow', async () => {
    const req = { rawBody: Buffer.from('valid') } as any;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

    constructEventMock.mockReturnValue({
      id: 'evt_donation_fail',
      type: 'payment_intent.payment_failed',
      data: {
        object: {
          id: 'pi_donation_fail',
        },
      },
    });

    await controller.handleStripeWebhook(req, res, 'valid-sig');

    expect(supportServiceMock.failDonationPayment).toHaveBeenCalledWith(
      'pi_donation_fail',
      'evt_donation_fail',
    );
    expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });

  it('returns service unavailable when donation webhooks are disabled', async () => {
    const req = { rawBody: Buffer.from('valid') } as any;
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() } as any;

    configGetMock.mockImplementation((key: string) => {
      if (key === 'STRIPE_SECRET_KEY') return 'sk_test_dummy';
      if (key === 'DONATIONS_STRIPE_WEBHOOK_SECRET') return undefined;
      return undefined;
    });

    await controller.handleStripeWebhook(req, res, 'valid-sig');

    expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(res.send).toHaveBeenCalledWith('Donation webhook support is disabled');
  });
});
