import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeliveryStatus,
  PaymentAccountOwnerType,
  PaymentAccountProvider,
  PaymentSessionStatus,
  ProviderOrderStatus,
  ProviderPaymentStatus,
} from '@prisma/client';
import Stripe from 'stripe';
import { PaymentSummaryBuilder } from './payment-summary.builder';
import { ProviderPaymentPreparationService } from './provider-payment-preparation.service';
import { ProviderPaymentAggregateService } from './provider-payment-aggregate.service';
import { ProviderPaymentIntentActivationService } from './provider-payment-intent-activation.service';

jest.mock('stripe');

describe('ProviderPaymentPreparationService', () => {
  let service: ProviderPaymentPreparationService;
  let prismaMock: any;
  let configServiceMock: { get: jest.Mock };
  let stripePaymentIntentsCreate: jest.Mock;
  let stripePaymentIntentsRetrieve: jest.Mock;
  let stripePaymentIntentsCancel: jest.Mock;
  let resolveActiveStripePaymentAccountWithinClient: jest.Mock;
  let aggregateService: ProviderPaymentAggregateService;
  let intentActivationService: ProviderPaymentIntentActivationService;

  beforeEach(() => {
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

    const stripeMock = {
      paymentIntents: {
        create: stripePaymentIntentsCreate,
        retrieve: stripePaymentIntentsRetrieve,
        cancel: stripePaymentIntentsCancel,
      },
    } as unknown as Stripe;

    prismaMock = {
      order: {
        findUnique: jest.fn(),
      },
      providerPaymentSession: {
        updateMany: jest.fn(),
      },
      providerOrder: {
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    configServiceMock = {
      get: jest.fn((key: string) => {
        if (key === 'STRIPE_SECRET_KEY') return 'sk_test_dummy';
        if (key === 'DEMO_MODE') return 'false';
        return 'dummy';
      }),
    };
    resolveActiveStripePaymentAccountWithinClient = jest.fn();
    aggregateService = new ProviderPaymentAggregateService(
      prismaMock,
      configServiceMock as unknown as ConfigService,
      new PaymentSummaryBuilder(),
      'Este entorno demo no puede preparar pagos Stripe reales por comercio. El pedido y sus subpedidos siguen siendo válidos, pero el cobro requiere credenciales Stripe operativas.',
    );
    intentActivationService = new ProviderPaymentIntentActivationService(
      prismaMock,
      stripeMock,
      { warn: jest.fn() } as any,
    );

    service = new ProviderPaymentPreparationService(
      prismaMock,
      configServiceMock as unknown as ConfigService,
      stripeMock,
      { warn: jest.fn() } as any,
      new PaymentSummaryBuilder(),
      resolveActiveStripePaymentAccountWithinClient,
      aggregateService,
      intentActivationService,
    );
  });

  it('returns the same active provider payment session on retry', async () => {
    resolveActiveStripePaymentAccountWithinClient.mockResolvedValue({
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

  it('returns aggregate unavailable state in demo mode without opening sessions', async () => {
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

    const result = await service.prepareOrderProviderPayments(
      'order-1',
      'client-1',
    );

    expect(result.paymentEnvironment).toBe('UNAVAILABLE');
    expect(result.providerOrders).toEqual([
      expect.objectContaining({
        providerOrderId: 'po-1',
        paymentRequired: true,
        paymentSession: null,
      }),
    ]);
  });

  it('rejects payment preparation when the provider order has no active reservation', async () => {
    resolveActiveStripePaymentAccountWithinClient.mockResolvedValue({
      id: 'pa-1',
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
            status: ProviderOrderStatus.PENDING,
            paymentStatus: ProviderPaymentStatus.PENDING,
            paymentReadyAt: null,
            order: {
              id: 'order-1',
              clientId: 'client-1',
            },
            reservations: [],
            paymentSessions: [],
          }),
        },
      }),
    );

    await expect(
      service.prepareProviderOrderPayment('po-1', 'client-1'),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects payment preparation when the provider order belongs to another client', async () => {
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        $executeRaw: jest.fn(),
        providerOrder: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'po-1',
            providerId: 'provider-1',
            subtotalAmount: 25,
            status: ProviderOrderStatus.PENDING,
            paymentStatus: ProviderPaymentStatus.PENDING,
            paymentReadyAt: null,
            order: {
              id: 'order-1',
              clientId: 'client-2',
            },
            reservations: [{ expiresAt: new Date('2099-01-01T00:00:00.000Z') }],
            paymentSessions: [],
          }),
        },
      }),
    );

    await expect(
      service.prepareProviderOrderPayment('po-1', 'client-1'),
    ).rejects.toThrow('ProviderOrder not found');
  });

  it('rejects provider orders in an ineligible status', async () => {
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        $executeRaw: jest.fn(),
        providerOrder: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'po-1',
            providerId: 'provider-1',
            subtotalAmount: 25,
            status: ProviderOrderStatus.CANCELLED,
            paymentStatus: ProviderPaymentStatus.PENDING,
            paymentReadyAt: null,
            order: {
              id: 'order-1',
              clientId: 'client-1',
            },
            reservations: [{ expiresAt: new Date('2099-01-01T00:00:00.000Z') }],
            paymentSessions: [],
          }),
        },
      }),
    );

    await expect(
      service.prepareProviderOrderPayment('po-1', 'client-1'),
    ).rejects.toThrow('ProviderOrder is not eligible for payment preparation');
  });

  it('rejects payment preparation when the provider Stripe account is inactive', async () => {
    resolveActiveStripePaymentAccountWithinClient.mockResolvedValue(null);

    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        $executeRaw: jest.fn(),
        providerOrder: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'po-1',
            providerId: 'provider-1',
            subtotalAmount: 25,
            status: ProviderOrderStatus.PENDING,
            paymentStatus: ProviderPaymentStatus.PENDING,
            paymentReadyAt: null,
            order: {
              id: 'order-1',
              clientId: 'client-1',
            },
            reservations: [{ expiresAt: new Date('2099-01-01T00:00:00.000Z') }],
            paymentSessions: [],
          }),
        },
        providerPaymentSession: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          create: jest.fn(),
        },
      }),
    );

    await expect(
      service.prepareProviderOrderPayment('po-1', 'client-1'),
    ).rejects.toThrow(
      'Provider payment account is not active for this provider order',
    );
  });

  it('expires stale sessions and reuses the freshest active Stripe intent', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const update = jest.fn().mockResolvedValue({});

    resolveActiveStripePaymentAccountWithinClient.mockResolvedValue({
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
            status: ProviderOrderStatus.PAYMENT_PENDING,
            paymentStatus: ProviderPaymentStatus.PENDING,
            paymentReadyAt: null,
            order: {
              id: 'order-1',
              clientId: 'client-1',
            },
            reservations: [{ expiresAt: new Date('2099-01-01T01:00:00.000Z') }],
            paymentSessions: [
              {
                id: 'session-ready',
                externalSessionId: 'pi_existing_123',
                status: PaymentSessionStatus.READY,
                expiresAt: new Date('2099-01-01T00:30:00.000Z'),
              },
              {
                id: 'session-created',
                externalSessionId: null,
                status: PaymentSessionStatus.CREATED,
                expiresAt: new Date('2099-01-01T00:20:00.000Z'),
              },
              {
                id: 'session-expired',
                externalSessionId: null,
                status: PaymentSessionStatus.CREATED,
                expiresAt: new Date('2000-01-01T00:00:00.000Z'),
              },
            ],
          }),
          update,
        },
        providerPaymentSession: {
          updateMany,
          create: jest.fn(),
        },
      }),
    );

    const result = await service.prepareProviderOrderPayment(
      'po-1',
      'client-1',
    );

    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(stripePaymentIntentsRetrieve).toHaveBeenCalledWith(
      'pi_existing_123',
      { stripeAccount: 'acct_provider_1' },
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ProviderOrderStatus.PAYMENT_PENDING,
        }),
      }),
    );
    expect(result.paymentSessionId).toBe('session-ready');
  });
});
