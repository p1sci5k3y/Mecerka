import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import Stripe from 'stripe';
import { DeliveryService } from './delivery.service';
import { DeliveryWebhooksController } from './delivery-webhooks.controller';

jest.mock('stripe');

describe('DeliveryWebhooksController', () => {
  let controller: DeliveryWebhooksController;
  let deliveryServiceMock: {
    confirmRunnerPayment: jest.Mock;
    failRunnerPayment: jest.Mock;
  };
  let constructEventMock: jest.Mock;

  beforeEach(async () => {
    constructEventMock = jest.fn();
    (Stripe as unknown as jest.Mock).mockImplementation(() => ({
      webhooks: {
        constructEvent: constructEventMock,
      },
    }));

    deliveryServiceMock = {
      confirmRunnerPayment: jest
        .fn()
        .mockResolvedValue({ paymentStatus: 'PAID' }),
      failRunnerPayment: jest
        .fn()
        .mockResolvedValue({ paymentStatus: 'FAILED' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DeliveryWebhooksController],
      providers: [
        { provide: DeliveryService, useValue: deliveryServiceMock },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'STRIPE_SECRET_KEY') return 'sk_test_dummy';
              if (key === 'DELIVERY_STRIPE_WEBHOOK_SECRET')
                return 'whsec_delivery';
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    controller = module.get<DeliveryWebhooksController>(
      DeliveryWebhooksController,
    );
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
    expect(deliveryServiceMock.confirmRunnerPayment).not.toHaveBeenCalled();
  });

  it('processes succeeded runner payments with sanitized logs', async () => {
    const req = { rawBody: Buffer.from('valid') } as any;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
    const logSpy = jest.spyOn((controller as any).logger, 'log');

    constructEventMock.mockReturnValue({
      id: 'evt_runner_paid',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_runner_paid',
          client_secret: 'runner_secret_do_not_log',
        },
      },
    });

    await controller.handleStripeWebhook(req, res, 'valid-sig');

    expect(deliveryServiceMock.confirmRunnerPayment).toHaveBeenCalledWith(
      'pi_runner_paid',
      'evt_runner_paid',
    );
    expect(logSpy).toHaveBeenCalledWith(
      'Delivery webhook processed: event=evt_runner_paid session=pi_runner_paid status=PAID',
    );
    expect(logSpy.mock.calls[0]?.[0]).not.toContain('client_secret');
    expect(logSpy.mock.calls[0]?.[0]).not.toContain('runner_secret_do_not_log');
    expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });

  it('keeps duplicate-safe failed runner payment processing isolated', async () => {
    const req = { rawBody: Buffer.from('valid') } as any;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

    constructEventMock.mockReturnValue({
      id: 'evt_runner_failed',
      type: 'payment_intent.payment_failed',
      data: {
        object: {
          id: 'pi_runner_failed',
        },
      },
    });

    await controller.handleStripeWebhook(req, res, 'valid-sig');

    expect(deliveryServiceMock.failRunnerPayment).toHaveBeenCalledWith(
      'pi_runner_failed',
      'evt_runner_failed',
    );
    expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });
});
