import Stripe from 'stripe';
import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import {
  DeliveryStatus,
  PaymentAccountOwnerType,
  PaymentAccountProvider,
  PaymentSessionStatus,
  ProviderOrderStatus,
  ProviderPaymentStatus,
} from '@prisma/client';

jest.mock('stripe');

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prismaMock: any;
  let stripePaymentIntentsCreate: jest.Mock;
  let stripePaymentIntentsRetrieve: jest.Mock;
  let eventEmitterMock: { emit: jest.Mock };

  beforeEach(async () => {
    stripePaymentIntentsCreate = jest.fn().mockResolvedValue({
      id: 'pi_test_123',
      client_secret: 'pi_test_123_secret',
    });
    stripePaymentIntentsRetrieve = jest.fn().mockResolvedValue({
      id: 'pi_existing_123',
      client_secret: 'pi_existing_123_secret',
    });

    (Stripe as unknown as jest.Mock).mockImplementation(() => ({
      paymentIntents: {
        create: stripePaymentIntentsCreate,
        retrieve: stripePaymentIntentsRetrieve,
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
      paymentWebhookEvent: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      paymentAccount: {
        upsert: jest.fn(),
        findFirst: jest.fn(),
      },
      providerOrder: {
        findUnique: jest.fn(),
      },
      providerPaymentSession: {
        findUnique: jest.fn(),
      },
      stockReservation: {
        updateMany: jest.fn(),
      },
      product: {
        updateMany: jest.fn(),
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

  it('generates a provider payment session using the provider connected account', async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: 'PENDING',
      providerOrders: [
        {
          id: 'po-1',
        },
      ],
    });
    prismaMock.paymentAccount.findFirst.mockResolvedValue({
      id: 'pa-1',
      ownerType: PaymentAccountOwnerType.PROVIDER,
      ownerId: 'provider-1',
      provider: PaymentAccountProvider.STRIPE,
      externalAccountId: 'acct_provider_1',
      isActive: true,
    });
    const transactionProviderOrderFindUnique = jest.fn().mockResolvedValue({
      id: 'po-1',
      providerId: 'provider-1',
      subtotalAmount: 25,
      status: 'PENDING',
      paymentStatus: 'PENDING',
      paymentReadyAt: null,
      order: {
        id: 'order-1',
        clientId: 'client-1',
      },
      reservations: [{ expiresAt: new Date('2026-03-15T12:15:00.000Z') }],
      paymentSessions: [],
    });
    const transactionProviderOrderUpdate = jest.fn().mockResolvedValue({});
    const transactionPaymentSessionCreate = jest.fn().mockResolvedValue({
      id: 'session-1',
    });

    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        $executeRaw: jest.fn(),
        providerOrder: {
          findUnique: transactionProviderOrderFindUnique,
          update: transactionProviderOrderUpdate,
        },
        providerPaymentSession: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          create: transactionPaymentSessionCreate,
        },
      }),
    );

    await service.createTripartitePaymentIntent('order-1', 'client-1');

    expect(stripePaymentIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 2500,
        metadata: expect.objectContaining({
          orderId: 'order-1',
          providerOrderId: 'po-1',
        }),
      }),
      { stripeAccount: 'acct_provider_1' },
    );
    expect(prismaMock.order.update).not.toHaveBeenCalled();
    expect(transactionPaymentSessionCreate).toHaveBeenCalledWith({
      data: {
        providerOrderId: 'po-1',
        paymentProvider: PaymentAccountProvider.STRIPE,
        externalSessionId: 'pi_test_123',
        paymentUrl: null,
        status: PaymentSessionStatus.READY,
        expiresAt: new Date('2026-03-15T12:15:00.000Z'),
        providerResponsePayload: {
          livemode: false,
          paymentIntentId: 'pi_test_123',
          stripeAccountId: 'acct_provider_1',
        },
      },
    });
    expect(transactionProviderOrderUpdate).toHaveBeenCalledWith({
      where: { id: 'po-1' },
      data: {
        paymentStatus: ProviderPaymentStatus.PAYMENT_READY,
        paymentReadyAt: expect.any(Date),
        paymentExpiresAt: new Date('2026-03-15T12:15:00.000Z'),
        paymentRef: 'pi_test_123',
        status: 'PAYMENT_READY',
      },
    });
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
    prismaMock.paymentWebhookEvent.create.mockRejectedValue({ code: 'P2002' });

    const result = await service.confirmPayment(
      'order-1',
      'pi_test_123',
      'evt_duplicate',
    );

    expect(result).toEqual({ message: 'Webhook already processed' });
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('confirms provider payment atomically, consumes reservations, and decrements stock once', async () => {
    const transactionProductUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const transactionReservationsUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const transactionSessionUpdate = jest.fn().mockResolvedValue({});
    const transactionProviderOrderUpdate = jest.fn().mockResolvedValue({});
    const transactionOrderUpdate = jest.fn().mockResolvedValue({});

    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        paymentWebhookEvent: {
          create: jest.fn().mockResolvedValue({ id: 'evt_1' }),
        },
        providerPaymentSession: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'session-1',
            providerOrderId: 'po-1',
            externalSessionId: 'pi_test_123',
          }),
          update: transactionSessionUpdate,
        },
        providerOrder: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'po-1',
            paymentStatus: ProviderPaymentStatus.PENDING,
            status: ProviderOrderStatus.PAYMENT_READY,
            reservations: [
              {
                id: 'res-1',
                productId: 'prod-1',
                quantity: 2,
                expiresAt: new Date('2026-03-15T12:15:00.000Z'),
              },
            ],
            items: [{ productId: 'prod-1', quantity: 2 }],
            order: {
              id: 'order-1',
              status: DeliveryStatus.PENDING,
              providerOrders: [
                {
                  id: 'po-1',
                  paymentStatus: ProviderPaymentStatus.PENDING,
                },
              ],
            },
          }),
          update: transactionProviderOrderUpdate,
        },
        stockReservation: {
          updateMany: transactionReservationsUpdateMany,
        },
        product: {
          updateMany: transactionProductUpdateMany,
        },
        order: {
          update: transactionOrderUpdate,
        },
        $executeRaw: jest.fn(),
      }),
    );
    prismaMock.paymentWebhookEvent.create.mockResolvedValue({ id: 'evt_1' });
    prismaMock.paymentWebhookEvent.update.mockResolvedValue({});

    const result = await service.confirmProviderOrderPayment(
      'pi_test_123',
      'evt_1',
      'payment_intent.succeeded',
    );

    expect(transactionProductUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 'prod-1',
        stock: { gte: 2 },
      },
      data: {
        stock: { decrement: 2 },
      },
    });
    expect(transactionReservationsUpdateMany).toHaveBeenCalledWith({
      where: {
        providerOrderId: 'po-1',
        status: 'ACTIVE',
      },
      data: {
        status: 'CONSUMED',
      },
    });
    expect(transactionSessionUpdate).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: {
        status: PaymentSessionStatus.COMPLETED,
      },
    });
    expect(transactionProviderOrderUpdate).toHaveBeenCalledWith({
      where: { id: 'po-1' },
      data: {
        paymentStatus: ProviderPaymentStatus.PAID,
        status: ProviderOrderStatus.PAID,
        paidAt: expect.any(Date),
      },
    });
    expect(transactionOrderUpdate).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: {
        status: DeliveryStatus.CONFIRMED,
        confirmedAt: expect.any(Date),
      },
    });
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        orderId: 'order-1',
        providerOrderId: 'po-1',
        paymentStatus: ProviderPaymentStatus.PAID,
        paymentRef: 'pi_test_123',
      }),
    );
    expect(prismaMock.paymentWebhookEvent.update).toHaveBeenCalledWith({
      where: { id: 'evt_1' },
      data: {
        status: 'PROCESSED',
        processedAt: expect.any(Date),
      },
    });
  });

  it('does not decrement stock again when the provider order is already paid', async () => {
    prismaMock.paymentWebhookEvent.create.mockResolvedValue({ id: 'evt_2' });
    prismaMock.paymentWebhookEvent.update.mockResolvedValue({});
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        providerPaymentSession: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'session-1',
            providerOrderId: 'po-1',
            externalSessionId: 'pi_test_123',
          }),
        },
        providerOrder: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'po-1',
            paymentStatus: ProviderPaymentStatus.PAID,
            status: ProviderOrderStatus.PAID,
            reservations: [
              {
                id: 'res-1',
                productId: 'prod-1',
                quantity: 2,
                expiresAt: new Date('2026-03-15T12:15:00.000Z'),
              },
            ],
            items: [{ productId: 'prod-1', quantity: 2 }],
            order: {
              id: 'order-1',
              status: DeliveryStatus.CONFIRMED,
              providerOrders: [
                {
                  id: 'po-1',
                  paymentStatus: ProviderPaymentStatus.PAID,
                },
              ],
            },
          }),
        },
      }),
    );

    const result = await service.confirmProviderOrderPayment(
      'pi_test_123',
      'evt_2',
      'payment_intent.succeeded',
    );

    expect(result).toEqual({
      message: 'ProviderOrder already paid',
      status: ProviderOrderStatus.PAID,
    });
    expect(prismaMock.paymentWebhookEvent.update).toHaveBeenCalledWith({
      where: { id: 'evt_2' },
      data: {
        status: 'IGNORED',
        processedAt: expect.any(Date),
      },
    });
  });

  it('marks the webhook event as failed when confirmation processing errors', async () => {
    prismaMock.paymentWebhookEvent.create.mockResolvedValue({ id: 'evt_fail' });
    prismaMock.paymentWebhookEvent.update.mockResolvedValue({});
    prismaMock.$transaction.mockImplementation(async () => {
      throw new ConflictException('ProviderOrder has no active reservations to consume');
    });

    await expect(
      service.confirmProviderOrderPayment(
        'pi_test_123',
        'evt_fail',
        'payment_intent.succeeded',
      ),
    ).rejects.toThrow('ProviderOrder has no active reservations to consume');

    expect(prismaMock.paymentWebhookEvent.update).toHaveBeenCalledWith({
      where: { id: 'evt_fail' },
      data: {
        status: 'FAILED',
        processedAt: expect.any(Date),
      },
    });
  });

  it('returns the same active provider payment session on retry', async () => {
    prismaMock.paymentAccount.findFirst.mockResolvedValue({
      id: 'pa-1',
      ownerType: PaymentAccountOwnerType.PROVIDER,
      ownerId: 'provider-1',
      provider: PaymentAccountProvider.STRIPE,
      externalAccountId: 'acct_provider_1',
      isActive: true,
    });

    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        $executeRaw: jest.fn(),
        providerOrder: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'po-1',
            providerId: 'provider-1',
            subtotalAmount: 25,
            status: 'PAYMENT_READY',
            paymentStatus: 'PENDING',
            paymentReadyAt: null,
            order: {
              id: 'order-1',
              clientId: 'client-1',
            },
            reservations: [{ expiresAt: new Date('2026-03-15T12:15:00.000Z') }],
            paymentSessions: [
              {
                id: 'session-existing',
                externalSessionId: 'pi_existing_123',
                status: PaymentSessionStatus.READY,
                expiresAt: new Date('2099-01-01T00:00:00.000Z'),
              },
            ],
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        providerPaymentSession: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          create: jest.fn(),
        },
      }),
    );

    const result = await service.prepareProviderOrderPayment('po-1', 'client-1');

    expect(stripePaymentIntentsCreate).not.toHaveBeenCalled();
    expect(stripePaymentIntentsRetrieve).toHaveBeenCalledWith('pi_existing_123', {
      stripeAccount: 'acct_provider_1',
    });
    expect(result).toEqual(
      expect.objectContaining({
        providerOrderId: 'po-1',
        paymentSessionId: 'session-existing',
        externalSessionId: 'pi_existing_123',
        clientSecret: 'pi_existing_123_secret',
        stripeAccountId: 'acct_provider_1',
      }),
    );
  });

  it('regenerates the provider payment session when the previous one is expired', async () => {
    prismaMock.paymentAccount.findFirst.mockResolvedValue({
      id: 'pa-1',
      ownerType: PaymentAccountOwnerType.PROVIDER,
      ownerId: 'provider-1',
      provider: PaymentAccountProvider.STRIPE,
      externalAccountId: 'acct_provider_1',
      isActive: true,
    });
    const transactionUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const transactionCreate = jest.fn().mockResolvedValue({ id: 'session-new' });

    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        $executeRaw: jest.fn(),
        providerOrder: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'po-1',
            providerId: 'provider-1',
            subtotalAmount: 25,
            status: 'PAYMENT_READY',
            paymentStatus: 'PENDING',
            paymentReadyAt: null,
            order: {
              id: 'order-1',
              clientId: 'client-1',
            },
            reservations: [{ expiresAt: new Date('2026-03-15T12:15:00.000Z') }],
            paymentSessions: [
              {
                id: 'session-expired',
                externalSessionId: 'pi_expired_123',
                status: PaymentSessionStatus.READY,
                expiresAt: new Date('2000-01-01T00:00:00.000Z'),
              },
            ],
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        providerPaymentSession: {
          updateMany: transactionUpdateMany,
          create: transactionCreate,
        },
      }),
    );

    const result = await service.prepareProviderOrderPayment('po-1', 'client-1');

    expect(transactionUpdateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['session-expired'] },
        status: { in: [PaymentSessionStatus.CREATED, PaymentSessionStatus.READY] },
      },
      data: {
        status: PaymentSessionStatus.EXPIRED,
      },
    });
    expect(stripePaymentIntentsCreate).toHaveBeenCalledTimes(1);
    expect(result).toEqual(
      expect.objectContaining({
        providerOrderId: 'po-1',
        paymentSessionId: 'session-new',
        externalSessionId: 'pi_test_123',
      }),
    );
  });

  it('maps provider payment account ownership through the shared payment account model', async () => {
    prismaMock.paymentAccount.upsert.mockResolvedValue({
      id: 'pa-1',
      ownerType: PaymentAccountOwnerType.PROVIDER,
      ownerId: 'provider-1',
      provider: PaymentAccountProvider.STRIPE,
      externalAccountId: 'acct_provider_1',
      isActive: true,
    });

    const result = await service.upsertPaymentAccount(
      PaymentAccountOwnerType.PROVIDER,
      'provider-1',
      PaymentAccountProvider.STRIPE,
      'acct_provider_1',
    );

    expect(prismaMock.paymentAccount.upsert).toHaveBeenCalledWith({
      where: {
        ownerType_ownerId_provider: {
          ownerType: PaymentAccountOwnerType.PROVIDER,
          ownerId: 'provider-1',
          provider: PaymentAccountProvider.STRIPE,
        },
      },
      update: {
        externalAccountId: 'acct_provider_1',
        isActive: true,
      },
      create: {
        ownerType: PaymentAccountOwnerType.PROVIDER,
        ownerId: 'provider-1',
        provider: PaymentAccountProvider.STRIPE,
        externalAccountId: 'acct_provider_1',
        isActive: true,
      },
    });
    expect(result).toEqual(
      expect.objectContaining({
        ownerType: PaymentAccountOwnerType.PROVIDER,
        ownerId: 'provider-1',
        provider: PaymentAccountProvider.STRIPE,
      }),
    );
  });
});
