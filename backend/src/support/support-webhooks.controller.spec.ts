import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { SupportWebhooksController } from './support-webhooks.controller';

jest.mock('stripe');

describe('SupportWebhooksController', () => {
  let controller: SupportWebhooksController;
  let supportServiceMock: {
    confirmDonationPayment: jest.Mock;
    failDonationPayment: jest.Mock;
  };
  let constructEventMock: jest.Mock;

  beforeEach(() => {
    constructEventMock = jest.fn();
    (Stripe as unknown as jest.Mock).mockImplementation(() => ({
      webhooks: {
        constructEvent: constructEventMock,
      },
    }));

    supportServiceMock = {
      confirmDonationPayment: jest.fn().mockResolvedValue({ status: 'PAID' }),
      failDonationPayment: jest.fn().mockResolvedValue({ status: 'FAILED' }),
    };

    controller = new SupportWebhooksController(
      supportServiceMock as never,
      {
        get: jest.fn((key: string) => {
          if (key === 'STRIPE_SECRET_KEY') return 'sk_test_dummy';
          if (key === 'DONATIONS_STRIPE_WEBHOOK_SECRET')
            return 'whsec_donations';
          return undefined;
        }),
      } as unknown as ConfigService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns 503 when donation webhook support is disabled', async () => {
    const req = { rawBody: Buffer.from('valid') } as any;
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() } as any;
    const disabledController = new SupportWebhooksController(
      supportServiceMock as never,
      { get: jest.fn(() => undefined) } as unknown as ConfigService,
    );

    await disabledController.handleStripeWebhook(req, res, 'valid-sig');

    expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(res.send).toHaveBeenCalledWith(
      'Donation webhook support is disabled',
    );
  });

  it('rejects missing signatures', async () => {
    const req = { rawBody: Buffer.from('valid') } as any;
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() } as any;

    await controller.handleStripeWebhook(req, res, '');

    expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(res.send).toHaveBeenCalledWith('Missing signature');
  });

  it('rejects missing raw bodies', async () => {
    const req = {} as any;
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() } as any;

    await controller.handleStripeWebhook(req, res, 'valid-sig');

    expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(res.send).toHaveBeenCalledWith('Missing raw body');
  });

  it('returns 400 for invalid signatures', async () => {
    const req = { rawBody: Buffer.from('invalid') } as any;
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() } as any;

    constructEventMock.mockImplementation(() => {
      throw new Error('invalid signature');
    });

    await controller.handleStripeWebhook(req, res, 'bad-sig');

    expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(res.send).toHaveBeenCalledWith('Webhook verification failed');
  });

  it('processes donation success webhooks', async () => {
    const req = { rawBody: Buffer.from('valid') } as any;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

    constructEventMock.mockReturnValue({
      id: 'evt_donation_paid',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_donation_paid' } },
    });

    await controller.handleStripeWebhook(req, res, 'valid-sig');

    expect(supportServiceMock.confirmDonationPayment).toHaveBeenCalledWith(
      'pi_donation_paid',
      'evt_donation_paid',
    );
    expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });

  it('processes donation failures and falls back to IGNORED when status is missing', async () => {
    const req = { rawBody: Buffer.from('valid') } as any;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

    supportServiceMock.failDonationPayment.mockResolvedValueOnce({});
    constructEventMock.mockReturnValue({
      id: 'evt_donation_failed',
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_donation_failed' } },
    });

    await controller.handleStripeWebhook(req, res, 'valid-sig');

    expect(supportServiceMock.failDonationPayment).toHaveBeenCalledWith(
      'pi_donation_failed',
      'evt_donation_failed',
    );
    expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });

  it('returns 200 for ignored donation events', async () => {
    const req = { rawBody: Buffer.from('valid') } as any;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

    constructEventMock.mockReturnValue({
      id: 'evt_donation_ignored',
      type: 'payment_intent.created',
      data: { object: { id: 'pi_donation_ignored' } },
    });

    await controller.handleStripeWebhook(req, res, 'valid-sig');

    expect(supportServiceMock.confirmDonationPayment).not.toHaveBeenCalled();
    expect(supportServiceMock.failDonationPayment).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
  });

  it('returns 500 when donation processing fails', async () => {
    const req = { rawBody: Buffer.from('valid') } as any;
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() } as any;

    supportServiceMock.confirmDonationPayment.mockRejectedValueOnce(
      new Error('processing failed'),
    );
    constructEventMock.mockReturnValue({
      id: 'evt_donation_error',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_donation_error' } },
    });

    await controller.handleStripeWebhook(req, res, 'valid-sig');

    expect(res.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(res.send).toHaveBeenCalledWith('Error processing donation webhook');
  });
});
