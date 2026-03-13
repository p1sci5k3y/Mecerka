import Stripe from 'stripe';
import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';

jest.mock('stripe');

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prismaMock: any;
  let stripePaymentIntentsCreate: jest.Mock;
  let eventEmitterMock: { emit: jest.Mock };

  beforeEach(async () => {
    stripePaymentIntentsCreate = jest.fn().mockResolvedValue({
      id: 'pi_test_123',
      client_secret: 'pi_test_123_secret',
    });

    (Stripe as unknown as jest.Mock).mockImplementation(() => ({
      paymentIntents: {
        create: stripePaymentIntentsCreate,
      },
    }));

    prismaMock = {
      order: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      webhookEvent: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    eventEmitterMock = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: EventEmitter2, useValue: eventEmitterMock },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'STRIPE_SECRET_KEY' ? 'sk_test_dummy' : 'dummy',
            ),
          },
        },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('stores orderId metadata expected by the verified webhook controller', async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: 'PENDING',
      providerOrders: [
        {
          provider: { stripeAccountId: 'acct_provider_1' },
          items: [{ priceAtPurchase: '12.50', quantity: 2 }],
        },
      ],
    });
    prismaMock.order.update.mockResolvedValue({});

    await service.createTripartitePaymentIntent('order-1', 'client-1');

    expect(stripePaymentIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ orderId: 'order-1' }),
      }),
      expect.any(Object),
    );
  });

  it('rejects multi-provider intents until the payment domain supports settlement', async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: 'PENDING',
      providerOrders: [
        {
          provider: { stripeAccountId: 'acct_provider_1' },
          items: [{ priceAtPurchase: '12.50', quantity: 1 }],
        },
        {
          provider: { stripeAccountId: 'acct_provider_2' },
          items: [{ priceAtPurchase: '9.50', quantity: 1 }],
        },
      ],
    });

    await expect(
      service.createTripartitePaymentIntent('order-1', 'client-1'),
    ).rejects.toThrow(ConflictException);

    expect(stripePaymentIntentsCreate).not.toHaveBeenCalled();
  });

  it('treats concurrent duplicate webhook inserts as idempotent and emits no side effects', async () => {
    prismaMock.webhookEvent.findUnique.mockResolvedValue(null);
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        webhookEvent: {
          create: jest.fn().mockRejectedValue({ code: 'P2002' }),
        },
      }),
    );

    const result = await service.confirmPayment(
      'order-1',
      'pi_test_123',
      'evt_duplicate',
    );

    expect(result).toEqual({ message: 'Webhook already processed concurrently' });
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });
});
