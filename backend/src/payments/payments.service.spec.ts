import Stripe from 'stripe';
import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { StripeWebhookService } from './stripe-webhook.service';
import { PaymentWebhookEventService } from './payment-webhook-event.service';
import { ProviderPaymentConfirmationService } from './provider-payment-confirmation.service';
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
import { IPaymentAccountRepository } from './repositories/payment-account.repository.interface';

jest.mock('stripe');

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prismaMock: any;
  let paymentAccountRepoMock: { findActive: jest.Mock; upsert: jest.Mock };
  let configServiceMock: { get: jest.Mock };
  let stripePaymentIntentsCreate: jest.Mock;
  let stripePaymentIntentsRetrieve: jest.Mock;
  let stripePaymentIntentsCancel: jest.Mock;
  let eventEmitterMock: { emit: jest.Mock };

  const buildConfirmationPayload = (overrides: Record<string, any> = {}) => ({
    amount: 2500,
    amountReceived: 2500,
    currency: 'eur',
    accountId: 'acct_provider_1',
    metadata: {
      orderId: 'order-1',
      providerOrderId: 'po-1',
      providerPaymentSessionId: 'session-1',
    },
    ...overrides,
  });

  beforeEach(async () => {
    stripePaymentIntentsCreate = jest.fn().mockResolvedValue({
      id: 'pi_test_123',
      client_secret: 'pi_test_123_secret',
    });
    stripePaymentIntentsRetrieve = jest.fn().mockResolvedValue({
      id: 'pi_existing_123',
      client_secret: 'pi_existing_123_secret',
    });
    stripePaymentIntentsCancel = jest.fn().mockResolvedValue({
      id: 'pi_test_123',
      status: 'canceled',
    });

    (Stripe as unknown as jest.Mock).mockImplementation(() => ({
      paymentIntents: {
        create: stripePaymentIntentsCreate,
        retrieve: stripePaymentIntentsRetrieve,
        cancel: stripePaymentIntentsCancel,
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
        updateMany: jest.fn(),
      },
      paymentAccount: {
        upsert: jest.fn(),
        findFirst: jest.fn(),
      },
      providerOrder: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      providerPaymentSession: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        groupBy: jest.fn(),
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
    paymentAccountRepoMock = { findActive: jest.fn(), upsert: jest.fn() };

    configServiceMock = {
      get: jest.fn((key: string) => {
        if (key === 'STRIPE_SECRET_KEY') return 'sk_test_dummy';
        if (key === 'DEMO_MODE') return 'false';
        return 'dummy';
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        StripeWebhookService,
        PaymentWebhookEventService,
        ProviderPaymentConfirmationService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: EventEmitter2, useValue: eventEmitterMock },
        { provide: ConfigService, useValue: configServiceMock },
        {
          provide: IPaymentAccountRepository,
          useValue: paymentAccountRepoMock,
        },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('prepares one payment session per provider order for the official root-order payment flow', async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: 'order-1',
      clientId: 'client-1',
      status: DeliveryStatus.PENDING,
      deliveryFee: 5.15,
      deliveryDistanceKm: 0.17,
      runnerBaseFee: 3.5,
      runnerPerKmFee: 0.9,
      runnerExtraPickupFee: 1.5,
      providerOrders: [
        {
          id: 'po-1',
          providerId: 'provider-1',
          provider: { name: 'Taller Terra' },
          subtotalAmount: 25,
          items: [
            { quantity: 2, priceAtPurchase: 12.5, unitBasePriceSnapshot: 14 },
          ],
          status: ProviderOrderStatus.PENDING,
          paymentStatus: ProviderPaymentStatus.PENDING,
        },
        {
          id: 'po-2',
          providerId: 'provider-2',
          provider: { name: 'Luz de Barrio' },
          subtotalAmount: 40,
          items: [
            { quantity: 2, priceAtPurchase: 20, unitBasePriceSnapshot: 20 },
          ],
          status: ProviderOrderStatus.PENDING,
          paymentStatus: ProviderPaymentStatus.PENDING,
        },
      ],
      deliveryOrder: null,
    });

    const prepareProviderOrderPaymentSpy = jest
      .spyOn(service, 'prepareProviderOrderPayment')
      .mockResolvedValueOnce({
        providerOrderId: 'po-1',
        paymentSessionId: 'session-1',
        orderId: 'order-1',
        subtotalAmount: 25,
        externalSessionId: 'pi_1',
        clientSecret: 'pi_1_secret',
        stripeAccountId: 'acct_provider_1',
        expiresAt: new Date('2026-03-20T10:00:00.000Z'),
        paymentStatus: ProviderPaymentStatus.PAYMENT_READY,
      } as any)
      .mockResolvedValueOnce({
        providerOrderId: 'po-2',
        paymentSessionId: 'session-2',
        orderId: 'order-1',
        subtotalAmount: 40,
        externalSessionId: 'pi_2',
        clientSecret: 'pi_2_secret',
        stripeAccountId: 'acct_provider_2',
        expiresAt: new Date('2026-03-20T10:00:00.000Z'),
        paymentStatus: ProviderPaymentStatus.PAYMENT_READY,
      } as any);

    const result = await service.prepareOrderProviderPayments(
      'order-1',
      'client-1',
    );

    expect(prepareProviderOrderPaymentSpy).toHaveBeenNthCalledWith(
      1,
      'po-1',
      'client-1',
    );
    expect(prepareProviderOrderPaymentSpy).toHaveBeenNthCalledWith(
      2,
      'po-2',
      'client-1',
    );
    expect(result).toEqual({
      orderId: 'order-1',
      orderStatus: DeliveryStatus.PENDING,
      paymentMode: 'PROVIDER_ORDER_SESSIONS',
      paymentEnvironment: 'READY',
      paymentEnvironmentMessage: null,
      providerPaymentStatus: 'UNPAID',
      paidProviderOrders: 0,
      totalProviderOrders: 2,
      providerOrders: [
        expect.objectContaining({
          providerOrderId: 'po-1',
          providerId: 'provider-1',
          providerName: 'Taller Terra',
          originalSubtotalAmount: 28,
          discountAmount: 3,
          paymentRequired: true,
          paymentStatus: ProviderPaymentStatus.PAYMENT_READY,
        }),
        expect.objectContaining({
          providerOrderId: 'po-2',
          providerId: 'provider-2',
          providerName: 'Luz de Barrio',
          originalSubtotalAmount: 40,
          discountAmount: 0,
          paymentRequired: true,
          paymentStatus: ProviderPaymentStatus.PAYMENT_READY,
        }),
      ],
      runnerPayment: {
        paymentMode: 'DELIVERY_ORDER_SESSION',
        deliveryOrderId: null,
        runnerId: null,
        deliveryStatus: null,
        paymentStatus: 'NOT_CREATED',
        paymentRequired: false,
        sessionPrepared: false,
        amount: 5.15,
        currency: 'EUR',
        pricingDistanceKm: 0.17,
        pickupCount: 2,
        additionalPickupCount: 1,
        baseFee: 3.5,
        perKmFee: 0.9,
        distanceFee: 0.15,
        extraPickupFee: 1.5,
        extraPickupCharge: 1.5,
      },
    });
  });

  it('keeps already settled provider orders out of payment preparation on the official root-order flow', async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: 'order-1',
      clientId: 'client-1',
      status: DeliveryStatus.CONFIRMED,
      deliveryFee: 5.15,
      deliveryDistanceKm: 0.17,
      runnerBaseFee: 3.5,
      runnerPerKmFee: 0.9,
      runnerExtraPickupFee: 1.5,
      providerOrders: [
        {
          id: 'po-paid',
          providerId: 'provider-1',
          provider: { name: 'Taller Terra' },
          subtotalAmount: 25,
          items: [
            { quantity: 2, priceAtPurchase: 12.5, unitBasePriceSnapshot: 14 },
          ],
          status: ProviderOrderStatus.PAID,
          paymentStatus: ProviderPaymentStatus.PAID,
        },
        {
          id: 'po-open',
          providerId: 'provider-2',
          provider: { name: 'Luz de Barrio' },
          subtotalAmount: 40,
          items: [
            { quantity: 2, priceAtPurchase: 20, unitBasePriceSnapshot: 20 },
          ],
          status: ProviderOrderStatus.PENDING,
          paymentStatus: ProviderPaymentStatus.PENDING,
        },
      ],
      deliveryOrder: {
        id: 'delivery-1',
        runnerId: 'runner-1',
        status: 'RUNNER_ASSIGNED',
        paymentStatus: 'PENDING',
        currency: 'EUR',
        paymentSessions: [],
      },
    });

    const prepareProviderOrderPaymentSpy = jest
      .spyOn(service, 'prepareProviderOrderPayment')
      .mockResolvedValue({
        providerOrderId: 'po-open',
        paymentSessionId: 'session-open',
        orderId: 'order-1',
        subtotalAmount: 40,
        externalSessionId: 'pi_open',
        clientSecret: 'pi_open_secret',
        stripeAccountId: 'acct_provider_2',
        expiresAt: new Date('2026-03-20T10:00:00.000Z'),
        paymentStatus: ProviderPaymentStatus.PAYMENT_READY,
      } as any);

    const result = await service.prepareOrderProviderPayments(
      'order-1',
      'client-1',
    );

    expect(prepareProviderOrderPaymentSpy).toHaveBeenCalledTimes(1);
    expect(prepareProviderOrderPaymentSpy).toHaveBeenCalledWith(
      'po-open',
      'client-1',
    );
    expect(result.providerOrders).toEqual([
      {
        providerOrderId: 'po-paid',
        providerId: 'provider-1',
        providerName: 'Taller Terra',
        subtotalAmount: 25,
        originalSubtotalAmount: 28,
        discountAmount: 3,
        status: ProviderOrderStatus.PAID,
        paymentStatus: ProviderPaymentStatus.PAID,
        paymentRequired: false,
        paymentSession: null,
      },
      expect.objectContaining({
        providerOrderId: 'po-open',
        paymentRequired: true,
      }),
    ]);
    expect(result.orderStatus).toBe(DeliveryStatus.CONFIRMED);
    expect(result.providerPaymentStatus).toBe('PARTIALLY_PAID');
    expect(result.paidProviderOrders).toBe(1);
    expect(result.totalProviderOrders).toBe(2);
    expect(result.runnerPayment).toEqual({
      paymentMode: 'DELIVERY_ORDER_SESSION',
      deliveryOrderId: 'delivery-1',
      runnerId: 'runner-1',
      deliveryStatus: 'RUNNER_ASSIGNED',
      paymentStatus: 'PENDING',
      paymentRequired: true,
      sessionPrepared: false,
      amount: 5.15,
      currency: 'EUR',
      pricingDistanceKm: 0.17,
      pickupCount: 2,
      additionalPickupCount: 1,
      baseFee: 3.5,
      perKmFee: 0.9,
      distanceFee: 0.15,
      extraPickupFee: 1.5,
      extraPickupCharge: 1.5,
    });
  });

  it('returns the aggregate without opening Stripe sessions when demo mode uses dummy Stripe credentials', async () => {
    configServiceMock.get.mockImplementation((key: string) => {
      if (key === 'STRIPE_SECRET_KEY') return 'sk_test_dummy';
      if (key === 'DEMO_MODE') return 'true';
      return 'dummy';
    });

    prismaMock.order.findUnique.mockResolvedValue({
      id: 'order-1',
      clientId: 'client-1',
      status: DeliveryStatus.PENDING,
      deliveryFee: 5.15,
      deliveryDistanceKm: 0.17,
      runnerBaseFee: 3.5,
      runnerPerKmFee: 0.9,
      runnerExtraPickupFee: 1.5,
      providerOrders: [
        {
          id: 'po-1',
          providerId: 'provider-1',
          provider: { name: 'Taller Terra' },
          subtotalAmount: 25,
          items: [
            { quantity: 2, priceAtPurchase: 12.5, unitBasePriceSnapshot: 14 },
          ],
          status: ProviderOrderStatus.PENDING,
          paymentStatus: ProviderPaymentStatus.PENDING,
        },
      ],
      deliveryOrder: null,
    });

    const prepareProviderOrderPaymentSpy = jest.spyOn(
      service,
      'prepareProviderOrderPayment',
    );

    const result = await service.prepareOrderProviderPayments(
      'order-1',
      'client-1',
    );

    expect(prepareProviderOrderPaymentSpy).not.toHaveBeenCalled();
    expect(result.paymentEnvironment).toBe('UNAVAILABLE');
    expect(result.paymentEnvironmentMessage).toContain(
      'no puede preparar pagos Stripe reales por comercio',
    );
    expect(result.providerOrders).toEqual([
      expect.objectContaining({
        providerOrderId: 'po-1',
        paymentRequired: true,
        paymentSession: null,
        paymentStatus: ProviderPaymentStatus.PENDING,
      }),
    ]);
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
    const initialProviderOrderUpdate = jest.fn().mockResolvedValue({});
    const finalProviderOrderUpdate = jest.fn().mockResolvedValue({});
    const transactionPaymentSessionCreate = jest.fn().mockResolvedValue({
      id: 'session-1',
    });
    const transactionPaymentSessionUpdate = jest.fn().mockResolvedValue({});
    const transactionPaymentSessionUpdateMany = jest
      .fn()
      .mockResolvedValue({ count: 0 });
    const transactionProviderPaymentSessionFindUnique = jest
      .fn()
      .mockResolvedValue({
        id: 'session-1',
        status: PaymentSessionStatus.CREATED,
      });
    const txExecuteRaw = jest.fn();
    let transactionCall = 0;

    prismaMock.$transaction.mockImplementation(async (callback: any) => {
      transactionCall += 1;

      if (transactionCall === 1) {
        return callback({
          $executeRaw: txExecuteRaw,
          providerOrder: {
            findUnique: transactionProviderOrderFindUnique,
            update: initialProviderOrderUpdate,
          },
          providerPaymentSession: {
            updateMany: transactionPaymentSessionUpdateMany,
            create: transactionPaymentSessionCreate,
          },
          paymentAccount: {
            findFirst: prismaMock.paymentAccount.findFirst,
          },
          user: {
            findUnique: prismaMock.user.findUnique,
          },
        });
      }

      return callback({
        $executeRaw: txExecuteRaw,
        providerOrder: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'po-1',
            paymentStatus: ProviderPaymentStatus.PENDING,
            reservations: [{ expiresAt: new Date('2026-03-15T12:15:00.000Z') }],
          }),
          update: finalProviderOrderUpdate,
        },
        providerPaymentSession: {
          findUnique: transactionProviderPaymentSessionFindUnique,
          update: transactionPaymentSessionUpdate,
        },
      });
    });

    await service.createTripartitePaymentIntent('order-1', 'client-1');

    expect(stripePaymentIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 2500,
        metadata: expect.objectContaining({
          orderId: 'order-1',
          providerOrderId: 'po-1',
          providerPaymentSessionId: 'session-1',
        }),
      }),
      {
        stripeAccount: 'acct_provider_1',
        idempotencyKey: 'provider-payment-session:session-1',
      },
    );
    expect(prismaMock.order.update).not.toHaveBeenCalled();
    expect(transactionPaymentSessionCreate).toHaveBeenCalledWith({
      data: {
        providerOrderId: 'po-1',
        paymentProvider: PaymentAccountProvider.STRIPE,
        externalSessionId: null,
        paymentUrl: null,
        status: PaymentSessionStatus.CREATED,
        expiresAt: new Date('2026-03-15T12:15:00.000Z'),
      },
    });
    expect(initialProviderOrderUpdate).toHaveBeenCalledWith({
      where: { id: 'po-1' },
      data: {
        paymentStatus: ProviderPaymentStatus.PENDING,
        paymentReadyAt: null,
        paymentExpiresAt: new Date('2026-03-15T12:15:00.000Z'),
        paymentRef: null,
        status: 'PAYMENT_PENDING',
      },
    });
    expect(transactionPaymentSessionUpdate).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: {
        externalSessionId: 'pi_test_123',
        paymentUrl: null,
        status: PaymentSessionStatus.READY,
        expiresAt: new Date('2026-03-15T12:15:00.000Z'),
        providerResponsePayload: {
          stripeAccountId: 'acct_provider_1',
          paymentIntentId: 'pi_test_123',
          livemode: false,
          metadata: {
            orderId: 'order-1',
            providerOrderId: 'po-1',
            providerPaymentSessionId: 'session-1',
          },
        },
      },
    });
    expect(finalProviderOrderUpdate).toHaveBeenCalledWith({
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
    prismaMock.paymentWebhookEvent.updateMany.mockResolvedValue({ count: 0 });

    const result = await service.confirmProviderOrderPayment(
      'pi_test_123',
      'evt_duplicate',
      'payment_intent.succeeded',
    );

    expect(result).toEqual({ message: 'Webhook already processed' });
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('treats only terminal webhook statuses as processed', async () => {
    prismaMock.paymentWebhookEvent.findUnique
      .mockResolvedValueOnce({ status: 'PROCESSED' })
      .mockResolvedValueOnce({ status: 'IGNORED' })
      .mockResolvedValueOnce({ status: 'FAILED' })
      .mockResolvedValueOnce({ status: 'RECEIVED' })
      .mockResolvedValueOnce(null);

    await expect(service.isProcessed('evt_processed')).resolves.toBe(true);
    await expect(service.isProcessed('evt_ignored')).resolves.toBe(true);
    await expect(service.isProcessed('evt_failed')).resolves.toBe(false);
    await expect(service.isProcessed('evt_received')).resolves.toBe(false);
    await expect(service.isProcessed('evt_missing')).resolves.toBe(false);
  });

  it('confirms provider payment atomically, consumes reservations, and decrements stock once', async () => {
    const transactionProductUpdateMany = jest
      .fn()
      .mockResolvedValue({ count: 1 });
    const transactionReservationsUpdateMany = jest
      .fn()
      .mockResolvedValue({ count: 1 });
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
            status: PaymentSessionStatus.READY,
          }),
          update: transactionSessionUpdate,
        },
        providerOrder: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'po-1',
            providerId: 'provider-1',
            subtotalAmount: 25,
            paymentRef: 'pi_test_123',
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
            },
          }),
          update: transactionProviderOrderUpdate,
        },
        paymentAccount: {
          findFirst: jest.fn().mockResolvedValue({
            externalAccountId: 'acct_provider_1',
            isActive: true,
          }),
        },
        user: {
          findUnique: jest.fn(),
        },
        stockReservation: {
          updateMany: transactionReservationsUpdateMany,
        },
        product: {
          updateMany: transactionProductUpdateMany,
        },
        order: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'order-1',
            status: DeliveryStatus.PENDING,
            providerOrders: [
              {
                id: 'po-1',
                paymentStatus: ProviderPaymentStatus.PAID,
              },
            ],
          }),
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
      buildConfirmationPayload(),
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
        id: { in: ['res-1'] },
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
        $executeRaw: jest.fn(),
        providerPaymentSession: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'session-1',
            providerOrderId: 'po-1',
            externalSessionId: 'pi_test_123',
            status: PaymentSessionStatus.READY,
          }),
        },
        providerOrder: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'po-1',
            providerId: 'provider-1',
            subtotalAmount: 25,
            paymentRef: 'pi_test_123',
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
            },
          }),
        },
        paymentAccount: {
          findFirst: jest.fn().mockResolvedValue({
            externalAccountId: 'acct_provider_1',
            isActive: true,
          }),
        },
        user: {
          findUnique: jest.fn(),
        },
      }),
    );

    const result = await service.confirmProviderOrderPayment(
      'pi_test_123',
      'evt_2',
      'payment_intent.succeeded',
      buildConfirmationPayload(),
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
      throw new ConflictException(
        'ProviderOrder has no active reservations to consume',
      );
    });

    await expect(
      service.confirmProviderOrderPayment(
        'pi_test_123',
        'evt_fail',
        'payment_intent.succeeded',
        buildConfirmationPayload(),
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

  it('allows retry when a previously failed webhook event is delivered again', async () => {
    const transactionProductUpdateMany = jest
      .fn()
      .mockResolvedValue({ count: 1 });
    const transactionReservationsUpdateMany = jest
      .fn()
      .mockResolvedValue({ count: 1 });
    const transactionSessionUpdate = jest.fn().mockResolvedValue({});
    const transactionProviderOrderUpdate = jest.fn().mockResolvedValue({});
    const transactionOrderUpdate = jest.fn().mockResolvedValue({});

    prismaMock.paymentWebhookEvent.create.mockRejectedValue({ code: 'P2002' });
    prismaMock.paymentWebhookEvent.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.paymentWebhookEvent.update.mockResolvedValue({});
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        providerPaymentSession: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'session-1',
            providerOrderId: 'po-1',
            externalSessionId: 'pi_test_123',
            status: PaymentSessionStatus.READY,
          }),
          update: transactionSessionUpdate,
        },
        providerOrder: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'po-1',
            providerId: 'provider-1',
            subtotalAmount: 25,
            paymentRef: 'pi_test_123',
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
            },
          }),
          update: transactionProviderOrderUpdate,
        },
        paymentAccount: {
          findFirst: jest.fn().mockResolvedValue({
            externalAccountId: 'acct_provider_1',
            isActive: true,
          }),
        },
        user: {
          findUnique: jest.fn(),
        },
        stockReservation: {
          updateMany: transactionReservationsUpdateMany,
        },
        product: {
          updateMany: transactionProductUpdateMany,
        },
        order: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'order-1',
            status: DeliveryStatus.CONFIRMED,
            providerOrders: [
              {
                id: 'po-1',
                paymentStatus: ProviderPaymentStatus.PAID,
              },
            ],
          }),
          update: transactionOrderUpdate,
        },
        $executeRaw: jest.fn(),
      }),
    );

    const result = await service.confirmProviderOrderPayment(
      'pi_test_123',
      'evt_failed_retry',
      'payment_intent.succeeded',
      buildConfirmationPayload(),
    );

    expect(prismaMock.paymentWebhookEvent.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'evt_failed_retry',
        OR: [
          { status: 'FAILED' },
          {
            status: 'RECEIVED',
            receivedAt: { lt: expect.any(Date) },
          },
        ],
      },
      data: {
        provider: 'STRIPE',
        eventType: 'payment_intent.succeeded',
        status: 'RECEIVED',
        receivedAt: expect.any(Date),
        processedAt: null,
      },
    });
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        providerOrderId: 'po-1',
        paymentStatus: ProviderPaymentStatus.PAID,
      }),
    );
  });

  it('reclaims stale RECEIVED webhook events safely', async () => {
    prismaMock.paymentWebhookEvent.create.mockRejectedValue({ code: 'P2002' });
    prismaMock.paymentWebhookEvent.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.paymentWebhookEvent.update.mockResolvedValue({});
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        providerPaymentSession: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'session-1',
            providerOrderId: 'po-1',
            externalSessionId: 'pi_test_123',
            status: PaymentSessionStatus.COMPLETED,
          }),
        },
        providerOrder: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'po-1',
            status: ProviderOrderStatus.PAID,
            paymentStatus: ProviderPaymentStatus.PAID,
            paymentRef: 'pi_test_123',
            providerId: 'provider-1',
            subtotalAmount: 25,
            reservations: [],
            order: {
              id: 'order-1',
              status: DeliveryStatus.CONFIRMED,
            },
          }),
        },
        paymentAccount: {
          findFirst: jest.fn().mockResolvedValue({
            externalAccountId: 'acct_provider_1',
            isActive: true,
          }),
        },
        user: {
          findUnique: jest.fn(),
        },
        $executeRaw: jest.fn(),
      }),
    );

    const result = await service.confirmProviderOrderPayment(
      'pi_test_123',
      'evt_received_retry',
      'payment_intent.succeeded',
      buildConfirmationPayload(),
    );

    expect(prismaMock.paymentWebhookEvent.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'evt_received_retry',
        OR: [
          { status: 'FAILED' },
          {
            status: 'RECEIVED',
            receivedAt: { lt: expect.any(Date) },
          },
        ],
      },
      data: expect.objectContaining({
        provider: 'STRIPE',
        eventType: 'payment_intent.succeeded',
        status: 'RECEIVED',
        processedAt: null,
      }),
    });
    expect(result).toEqual({
      message: 'Provider payment session already completed',
      status: ProviderOrderStatus.PAID,
    });
  });

  it('rejects confirmation when Stripe facts do not match the provider order payment boundary', async () => {
    prismaMock.paymentWebhookEvent.create.mockResolvedValue({
      id: 'evt_mismatch',
    });
    prismaMock.paymentWebhookEvent.update.mockResolvedValue({});
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        providerPaymentSession: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'session-1',
            providerOrderId: 'po-1',
            externalSessionId: 'pi_test_123',
            status: PaymentSessionStatus.READY,
          }),
        },
        providerOrder: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'po-1',
            providerId: 'provider-1',
            subtotalAmount: 25,
            paymentRef: 'pi_test_123',
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
            order: {
              id: 'order-1',
              status: DeliveryStatus.PENDING,
            },
          }),
        },
        paymentAccount: {
          findFirst: jest.fn().mockResolvedValue({
            externalAccountId: 'acct_provider_1',
            isActive: true,
          }),
        },
        user: {
          findUnique: jest.fn(),
        },
        $executeRaw: jest.fn(),
      }),
    );

    await expect(
      service.confirmProviderOrderPayment(
        'pi_test_123',
        'evt_mismatch',
        'payment_intent.succeeded',
        buildConfirmationPayload({ amount: 2400, amountReceived: 2400 }),
      ),
    ).rejects.toThrow(
      'Payment amount does not match the expected provider order subtotal',
    );
  });

  it('rejects superseded provider payment sessions safely', async () => {
    prismaMock.paymentWebhookEvent.create.mockResolvedValue({
      id: 'evt_superseded',
    });
    prismaMock.paymentWebhookEvent.update.mockResolvedValue({});
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        providerPaymentSession: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'session-old',
            providerOrderId: 'po-1',
            externalSessionId: 'pi_old_123',
            status: PaymentSessionStatus.READY,
          }),
        },
        providerOrder: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'po-1',
            providerId: 'provider-1',
            subtotalAmount: 25,
            paymentRef: 'pi_current_123',
            paymentStatus: ProviderPaymentStatus.PAYMENT_READY,
            status: ProviderOrderStatus.PAYMENT_READY,
            reservations: [
              {
                id: 'res-1',
                productId: 'prod-1',
                quantity: 1,
                expiresAt: new Date('2026-03-15T12:15:00.000Z'),
              },
            ],
            order: {
              id: 'order-1',
              status: DeliveryStatus.PENDING,
            },
          }),
        },
        $executeRaw: jest.fn(),
      }),
    );

    await expect(
      service.confirmProviderOrderPayment(
        'pi_old_123',
        'evt_superseded',
        'payment_intent.succeeded',
        buildConfirmationPayload({
          amount: 2500,
          amountReceived: 2500,
          metadata: {
            orderId: 'order-1',
            providerOrderId: 'po-1',
            providerPaymentSessionId: 'session-old',
          },
        }),
      ),
    ).rejects.toThrow('Superseded payment session cannot be confirmed');
  });

  it('recomputes sibling provider payment states after updating the current provider order', async () => {
    const transactionProductUpdateMany = jest
      .fn()
      .mockResolvedValue({ count: 1 });
    const transactionReservationsUpdateMany = jest
      .fn()
      .mockResolvedValue({ count: 1 });
    const transactionSessionUpdate = jest.fn().mockResolvedValue({});
    const transactionProviderOrderUpdate = jest.fn().mockResolvedValue({});
    const transactionOrderFindUnique = jest.fn().mockResolvedValue({
      id: 'order-1',
      status: DeliveryStatus.PENDING,
      providerOrders: [
        {
          id: 'po-1',
          paymentStatus: ProviderPaymentStatus.PAID,
        },
        {
          id: 'po-2',
          paymentStatus: ProviderPaymentStatus.PAID,
        },
      ],
    });
    const transactionOrderUpdate = jest.fn().mockResolvedValue({});

    prismaMock.paymentWebhookEvent.create.mockResolvedValue({
      id: 'evt_recompute',
    });
    prismaMock.paymentWebhookEvent.update.mockResolvedValue({});
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        providerPaymentSession: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'session-1',
            providerOrderId: 'po-1',
            externalSessionId: 'pi_test_123',
            status: PaymentSessionStatus.READY,
          }),
          update: transactionSessionUpdate,
        },
        providerOrder: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'po-1',
            providerId: 'provider-1',
            subtotalAmount: 25,
            paymentRef: 'pi_test_123',
            paymentStatus: ProviderPaymentStatus.PAYMENT_READY,
            status: ProviderOrderStatus.PAYMENT_READY,
            reservations: [
              {
                id: 'res-1',
                productId: 'prod-1',
                quantity: 1,
                expiresAt: new Date('2026-03-15T12:15:00.000Z'),
              },
            ],
            items: [{ productId: 'prod-1', quantity: 1 }],
            order: {
              id: 'order-1',
              status: DeliveryStatus.PENDING,
            },
          }),
          update: transactionProviderOrderUpdate,
        },
        paymentAccount: {
          findFirst: jest.fn().mockResolvedValue({
            externalAccountId: 'acct_provider_1',
            isActive: true,
          }),
        },
        user: {
          findUnique: jest.fn(),
        },
        stockReservation: {
          updateMany: transactionReservationsUpdateMany,
        },
        product: {
          updateMany: transactionProductUpdateMany,
        },
        order: {
          findUnique: transactionOrderFindUnique,
          update: transactionOrderUpdate,
        },
        $executeRaw: jest.fn(),
      }),
    );

    const result = await service.confirmProviderOrderPayment(
      'pi_test_123',
      'evt_recompute',
      'payment_intent.succeeded',
      buildConfirmationPayload(),
    );

    expect(transactionOrderFindUnique).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      select: {
        id: true,
        status: true,
        providerOrders: {
          select: {
            id: true,
            paymentStatus: true,
          },
        },
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
        status: DeliveryStatus.CONFIRMED,
        orderId: 'order-1',
      }),
    );
  });

  it('rejects the legacy wrapper for multi-provider orders', async () => {
    prismaMock.paymentWebhookEvent.findUnique.mockResolvedValue(null);
    prismaMock.order.findUnique.mockResolvedValue({
      id: 'order-1',
      providerOrders: [{ id: 'po-1' }, { id: 'po-2' }],
    });

    await expect(
      service.confirmPayment('order-1', 'pi_test_123', 'evt_legacy'),
    ).rejects.toThrow(
      'Legacy payment confirmation wrapper only supports single-provider orders',
    );
  });

  it('disables the legacy wrapper even for single-provider orders', async () => {
    prismaMock.paymentWebhookEvent.findUnique.mockResolvedValue(null);
    prismaMock.order.findUnique.mockResolvedValue({
      id: 'order-1',
      providerOrders: [{ id: 'po-1' }],
    });

    await expect(
      service.confirmPayment('order-1', 'pi_test_123', 'evt_legacy_single'),
    ).rejects.toThrow(
      'Legacy payment confirmation wrapper is disabled. Use verified provider webhook confirmation instead.',
    );
  });

  it('keeps legacy cash payments disabled by default', async () => {
    await expect(
      service.processCashPayment('order-1', 'client-1', '1234'),
    ).rejects.toThrow(
      'Legacy cash payments are disabled. Use provider payment sessions instead.',
    );
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
        paymentAccount: {
          findFirst: prismaMock.paymentAccount.findFirst,
        },
        user: {
          findUnique: prismaMock.user.findUnique,
        },
      }),
    );

    const result = await service.prepareProviderOrderPayment(
      'po-1',
      'client-1',
    );

    expect(stripePaymentIntentsCreate).not.toHaveBeenCalled();
    expect(stripePaymentIntentsRetrieve).toHaveBeenCalledWith(
      'pi_existing_123',
      {
        stripeAccount: 'acct_provider_1',
      },
    );
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
    const transactionCreate = jest
      .fn()
      .mockResolvedValue({ id: 'session-new' });
    const initialProviderOrderUpdate = jest.fn().mockResolvedValue({});
    const finalProviderOrderUpdate = jest.fn().mockResolvedValue({});
    const transactionPaymentSessionFindUnique = jest.fn().mockResolvedValue({
      id: 'session-new',
      status: PaymentSessionStatus.CREATED,
    });
    const transactionPaymentSessionUpdate = jest.fn().mockResolvedValue({});
    let transactionCall = 0;

    prismaMock.$transaction.mockImplementation(async (callback: any) => {
      transactionCall += 1;

      if (transactionCall === 1) {
        return callback({
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
              reservations: [
                { expiresAt: new Date('2026-03-15T12:15:00.000Z') },
              ],
              paymentSessions: [
                {
                  id: 'session-expired',
                  externalSessionId: 'pi_expired_123',
                  status: PaymentSessionStatus.READY,
                  expiresAt: new Date('2000-01-01T00:00:00.000Z'),
                },
              ],
            }),
            update: initialProviderOrderUpdate,
          },
          providerPaymentSession: {
            updateMany: transactionUpdateMany,
            create: transactionCreate,
          },
          paymentAccount: {
            findFirst: prismaMock.paymentAccount.findFirst,
          },
          user: {
            findUnique: prismaMock.user.findUnique,
          },
        });
      }

      return callback({
        $executeRaw: jest.fn(),
        providerOrder: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'po-1',
            paymentStatus: ProviderPaymentStatus.PENDING,
            reservations: [{ expiresAt: new Date('2026-03-15T12:15:00.000Z') }],
          }),
          update: finalProviderOrderUpdate,
        },
        providerPaymentSession: {
          findUnique: transactionPaymentSessionFindUnique,
          update: transactionPaymentSessionUpdate,
        },
      });
    });

    const result = await service.prepareProviderOrderPayment(
      'po-1',
      'client-1',
    );

    expect(transactionUpdateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['session-expired'] },
        status: {
          in: [PaymentSessionStatus.CREATED, PaymentSessionStatus.READY],
        },
      },
      data: {
        status: PaymentSessionStatus.EXPIRED,
      },
    });
    expect(stripePaymentIntentsCreate).toHaveBeenCalledTimes(1);
    expect(transactionPaymentSessionUpdate).toHaveBeenCalledWith({
      where: { id: 'session-new' },
      data: {
        externalSessionId: 'pi_test_123',
        paymentUrl: null,
        status: PaymentSessionStatus.READY,
        expiresAt: new Date('2026-03-15T12:15:00.000Z'),
        providerResponsePayload: {
          stripeAccountId: 'acct_provider_1',
          paymentIntentId: 'pi_test_123',
          livemode: false,
          metadata: {
            orderId: 'order-1',
            providerOrderId: 'po-1',
            providerPaymentSessionId: 'session-new',
          },
        },
      },
    });
    expect(result).toEqual(
      expect.objectContaining({
        providerOrderId: 'po-1',
        paymentSessionId: 'session-new',
        externalSessionId: 'pi_test_123',
      }),
    );
  });

  it('maps provider payment account ownership through the shared payment account model', async () => {
    const expected = {
      id: 'pa-1',
      ownerType: PaymentAccountOwnerType.PROVIDER,
      ownerId: 'provider-1',
      provider: PaymentAccountProvider.STRIPE,
      externalAccountId: 'acct_provider_1',
      isActive: true,
    };
    paymentAccountRepoMock.upsert.mockResolvedValue(expected);

    const result = await service.upsertPaymentAccount(
      PaymentAccountOwnerType.PROVIDER,
      'provider-1',
      PaymentAccountProvider.STRIPE,
      'acct_provider_1',
    );

    expect(paymentAccountRepoMock.upsert).toHaveBeenCalledWith(
      PaymentAccountOwnerType.PROVIDER,
      'provider-1',
      PaymentAccountProvider.STRIPE,
      'acct_provider_1',
    );
    expect(result).toEqual(
      expect.objectContaining({
        ownerType: PaymentAccountOwnerType.PROVIDER,
        ownerId: 'provider-1',
        provider: PaymentAccountProvider.STRIPE,
      }),
    );
  });

  it('delegates payment account lookups to the repository', async () => {
    paymentAccountRepoMock.findActive.mockResolvedValue({
      id: 'pa-1',
      externalAccountId: 'acct_provider_1',
      isActive: true,
    });

    const result = await service.getActivePaymentAccount(
      PaymentAccountOwnerType.PROVIDER,
      'provider-1',
      PaymentAccountProvider.STRIPE,
    );

    expect(paymentAccountRepoMock.findActive).toHaveBeenCalledWith(
      PaymentAccountOwnerType.PROVIDER,
      'provider-1',
      PaymentAccountProvider.STRIPE,
    );
    expect(result).toEqual(
      expect.objectContaining({
        externalAccountId: 'acct_provider_1',
      }),
    );
  });

  it('hydrates a missing Stripe payment account from the user profile', async () => {
    prismaMock.paymentAccount.findFirst.mockResolvedValue(null);
    prismaMock.user.findUnique.mockResolvedValue({
      stripeAccountId: 'acct_provider_fallback',
    });
    paymentAccountRepoMock.upsert.mockResolvedValue({
      id: 'pa-fallback',
      externalAccountId: 'acct_provider_fallback',
      isActive: true,
    });

    const result = await (
      service as any
    ).resolveActiveStripePaymentAccountWithinClient(
      {
        paymentAccount: prismaMock.paymentAccount,
        user: prismaMock.user,
      },
      PaymentAccountOwnerType.PROVIDER,
      'provider-1',
    );

    expect(paymentAccountRepoMock.upsert).toHaveBeenCalledWith(
      PaymentAccountOwnerType.PROVIDER,
      'provider-1',
      PaymentAccountProvider.STRIPE,
      'acct_provider_fallback',
    );
    expect(result.externalAccountId).toBe('acct_provider_fallback');
  });

  it('returns null when no active Stripe account can be resolved', async () => {
    prismaMock.paymentAccount.findFirst.mockResolvedValue(null);
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(
      (service as any).resolveActiveStripePaymentAccountWithinClient(
        {
          paymentAccount: prismaMock.paymentAccount,
          user: prismaMock.user,
        },
        PaymentAccountOwnerType.PROVIDER,
        'provider-1',
      ),
    ).resolves.toBeNull();
  });

  it('rejects tripartite intents when the order is not pending or missing', async () => {
    prismaMock.order.findUnique.mockResolvedValue(null);

    await expect(
      service.createTripartitePaymentIntent('missing-order', 'client-1'),
    ).rejects.toThrow('Order not found or not in PENDING state');
  });

  it('rejects malformed single-provider orders without provider items', async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: DeliveryStatus.PENDING,
      providerOrders: [undefined],
    });

    await expect(
      service.createTripartitePaymentIntent('order-1', 'client-1'),
    ).rejects.toThrow('Order has no provider items');
  });

  it('throws during construction when STRIPE_SECRET_KEY is missing', async () => {
    const missingSecretConfig = {
      get: jest.fn(() => undefined),
    };

    await expect(
      Test.createTestingModule({
        providers: [
          PaymentsService,
          StripeWebhookService,
          PaymentWebhookEventService,
          ProviderPaymentConfirmationService,
          { provide: PrismaService, useValue: prismaMock },
          { provide: EventEmitter2, useValue: eventEmitterMock },
          { provide: ConfigService, useValue: missingSecretConfig },
          {
            provide: IPaymentAccountRepository,
            useValue: paymentAccountRepoMock,
          },
        ],
      }).compile(),
    ).rejects.toThrow(
      'STRIPE_SECRET_KEY is missing or empty in the environment configuration.',
    );
  });
});
