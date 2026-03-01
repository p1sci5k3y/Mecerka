import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksController } from './webhooks.controller';
import { OrdersService } from '../orders/orders.service';
import { HttpStatus } from '@nestjs/common';
import Stripe from 'stripe';

jest.mock('stripe');

describe('WebhooksController', () => {
  let controller: WebhooksController;
  let ordersServiceMock: Partial<OrdersService>;
  let mockConstructEvent: jest.Mock;

  beforeEach(async () => {
    mockConstructEvent = jest.fn();

    // Setup the Stripe constructor mock to return our mocked webhooks object
    (Stripe as unknown as jest.Mock).mockImplementation(() => ({
      webhooks: {
        constructEvent: mockConstructEvent,
      },
    }));

    ordersServiceMock = {
      confirmPayment: jest.fn().mockResolvedValue({ finalStatus: 'CONFIRMED' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [{ provide: OrdersService, useValue: ordersServiceMock }],
    }).compile();

    controller = module.get<WebhooksController>(WebhooksController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('1. Rejects missing signature with 400', async () => {
    const req = { rawBody: Buffer.from('') } as any;
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() } as any;

    await controller.handleStripeWebhook(req, res, '');

    expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(res.send).toHaveBeenCalledWith('Missing signature');
  });

  it('2. Rejects missing raw body with 400', async () => {
    const req = {} as any; // Empty Request
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() } as any;

    await controller.handleStripeWebhook(req, res, 'dummy-sig');

    expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(res.send).toHaveBeenCalledWith('Missing raw body');
  });

  it('3. Rejects invalid stripe signature with 400', async () => {
    const req = { rawBody: Buffer.from('bad_payload') } as any;
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() } as any;

    mockConstructEvent.mockImplementation(() => {
      throw new Error('Invalid signature');
    });

    await controller.handleStripeWebhook(req, res, 'bad-sig');

    expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(res.send).toHaveBeenCalledWith('Webhook Error: Invalid signature');
  });

  it('4. Processes valid signature + payment_intent.succeeded calling confirmPayment', async () => {
    const req = { rawBody: Buffer.from('valid_payload') } as any;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

    mockConstructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_123',
          metadata: { orderId: 'ord_123' },
        },
      },
    });

    await controller.handleStripeWebhook(req, res, 'valid-sig');

    expect(ordersServiceMock.confirmPayment).toHaveBeenCalledWith(
      'ord_123',
      'pi_123',
    );
    expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });

  it('5. Returns 200 for unhandled events to prevent Stripe retries', async () => {
    const req = { rawBody: Buffer.from('other_payload') } as any;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

    mockConstructEvent.mockReturnValue({
      type: 'charge.succeeded',
      data: { object: {} },
    });

    await controller.handleStripeWebhook(req, res, 'valid-sig');

    expect(ordersServiceMock.confirmPayment).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });

  it('6. Returns 500 when confirmPayment fails so Stripe retries later', async () => {
    const req = { rawBody: Buffer.from('valid_payload') } as any;
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() } as any;

    mockConstructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_123',
          metadata: { orderId: 'ord_123' },
        },
      },
    });

    // Simulate DB failure or concurrency panic
    (ordersServiceMock.confirmPayment as jest.Mock).mockRejectedValueOnce(
      new Error('DB Timeout'),
    );

    await controller.handleStripeWebhook(req, res, 'valid-sig');

    expect(ordersServiceMock.confirmPayment).toHaveBeenCalledWith(
      'ord_123',
      'pi_123',
    );
    expect(res.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(res.send).toHaveBeenCalledWith(
      'Error processing payment confirmation',
    );
  });
});
