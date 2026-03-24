import { ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { PaymentSessionStatus, ProviderPaymentStatus } from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { ProviderPaymentIntentActivationService } from './provider-payment-intent-activation.service';
import { PreparedProviderOrderPayment } from './provider-payment-preparation.types';

describe('ProviderPaymentIntentActivationService', () => {
  let service: ProviderPaymentIntentActivationService;
  let prismaMock: {
    providerPaymentSession: { updateMany: jest.Mock };
    providerOrder: { updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let stripePaymentIntentsCreate: jest.Mock;
  let stripePaymentIntentsCancel: jest.Mock;
  let loggerMock: { warn: jest.Mock };

  const buildPrepared = (
    overrides: Partial<PreparedProviderOrderPayment> = {},
  ): PreparedProviderOrderPayment => ({
    providerOrderId: 'po-1',
    paymentSessionId: 'session-1',
    orderId: 'order-1',
    subtotalAmount: 25,
    stripeAccountId: 'acct_provider_1',
    expiresAt: new Date('2099-01-01T01:00:00.000Z'),
    paymentStatus: ProviderPaymentStatus.PENDING,
    externalSessionId: null,
    clientSecret: null,
    ...overrides,
  });

  beforeEach(() => {
    stripePaymentIntentsCreate = jest.fn().mockResolvedValue({
      id: 'pi_test_123',
      client_secret: 'pi_test_123_secret',
      livemode: false,
    });
    stripePaymentIntentsCancel = jest.fn().mockResolvedValue({
      id: 'pi_test_123',
      status: 'canceled',
    });

    prismaMock = {
      providerPaymentSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      providerOrder: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn(),
    };

    loggerMock = {
      warn: jest.fn(),
    };

    service = new ProviderPaymentIntentActivationService(
      prismaMock as unknown as PrismaService,
      {
        paymentIntents: {
          create: stripePaymentIntentsCreate,
          cancel: stripePaymentIntentsCancel,
        },
      } as unknown as Stripe,
      loggerMock as unknown as Logger,
    );
  });

  it('returns the prepared payment untouched when an external session already exists', async () => {
    const prepared = buildPrepared({
      externalSessionId: 'pi_existing_123',
      clientSecret: 'pi_existing_123_secret',
    });

    await expect(
      service.activatePreparedProviderOrderPayment(prepared),
    ).resolves.toEqual(prepared);
    expect(stripePaymentIntentsCreate).not.toHaveBeenCalled();
  });

  it('rejects prepared payments without a parent order id', async () => {
    await expect(
      service.activatePreparedProviderOrderPayment(
        buildPrepared({ orderId: undefined }),
      ),
    ).rejects.toThrow(
      'Prepared provider payment is missing the parent order identifier',
    );
  });

  it('rejects prepared payments without a subtotal amount', async () => {
    await expect(
      service.activatePreparedProviderOrderPayment(
        buildPrepared({ subtotalAmount: undefined }),
      ),
    ).rejects.toThrow(
      'Prepared provider payment is missing the provider order subtotal',
    );
  });

  it('rejects prepared payments without a Stripe account id', async () => {
    await expect(
      service.activatePreparedProviderOrderPayment(
        buildPrepared({ stripeAccountId: undefined }),
      ),
    ).rejects.toThrow(
      'Prepared provider payment is missing the Stripe connected account identifier',
    );
  });

  it('marks the session as failed when Stripe intent creation fails', async () => {
    const stripeFailure = new Error('stripe unavailable');
    stripePaymentIntentsCreate.mockRejectedValue(stripeFailure);

    await expect(
      service.activatePreparedProviderOrderPayment(buildPrepared()),
    ).rejects.toThrow(stripeFailure);

    expect(prismaMock.providerPaymentSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'session-1',
        status: PaymentSessionStatus.CREATED,
      },
      data: {
        status: PaymentSessionStatus.FAILED,
      },
    });
    expect(prismaMock.providerOrder.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'po-1',
        paymentStatus: ProviderPaymentStatus.PENDING,
      },
      data: {
        paymentStatus: ProviderPaymentStatus.PENDING,
        status: 'PENDING',
      },
    });
  });

  it('activates the Stripe intent and marks the provider payment ready', async () => {
    const txMock = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      providerOrder: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'po-1',
          paymentStatus: ProviderPaymentStatus.PENDING,
          reservations: [
            { expiresAt: new Date('2099-01-01T02:00:00.000Z') },
            { expiresAt: new Date('2099-01-01T01:00:00.000Z') },
          ],
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      providerPaymentSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'session-1',
          status: PaymentSessionStatus.CREATED,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    prismaMock.$transaction.mockImplementation(
      async <T>(cb: (tx: typeof txMock) => Promise<T> | T) => cb(txMock),
    );

    const result =
      await service.activatePreparedProviderOrderPayment(buildPrepared());

    expect(stripePaymentIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 2500,
        currency: 'eur',
        metadata: {
          orderId: 'order-1',
          providerOrderId: 'po-1',
          providerPaymentSessionId: 'session-1',
        },
      }),
      {
        stripeAccount: 'acct_provider_1',
        idempotencyKey: 'provider-payment-session:session-1',
      },
    );
    expect(txMock.providerPaymentSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: expect.objectContaining({
        externalSessionId: 'pi_test_123',
        status: PaymentSessionStatus.READY,
        expiresAt: new Date('2099-01-01T01:00:00.000Z'),
      }),
    });
    expect(txMock.providerOrder.update).toHaveBeenCalledWith({
      where: { id: 'po-1' },
      data: expect.objectContaining({
        paymentStatus: ProviderPaymentStatus.PAYMENT_READY,
        paymentRef: 'pi_test_123',
        status: 'PAYMENT_READY',
      }),
    });
    expect(result).toEqual(
      expect.objectContaining({
        providerOrderId: 'po-1',
        paymentSessionId: 'session-1',
        externalSessionId: 'pi_test_123',
        clientSecret: 'pi_test_123_secret',
        stripeAccountId: 'acct_provider_1',
        paymentStatus: ProviderPaymentStatus.PAYMENT_READY,
      }),
    );
  });

  it('cancels the orphaned intent and marks the session failed when activation transaction fails', async () => {
    prismaMock.$transaction.mockRejectedValue(
      new NotFoundException('ProviderOrder not found'),
    );

    await expect(
      service.activatePreparedProviderOrderPayment(buildPrepared()),
    ).rejects.toThrow('ProviderOrder not found');

    expect(stripePaymentIntentsCancel).toHaveBeenCalledWith('pi_test_123', {
      stripeAccount: 'acct_provider_1',
    });
    expect(prismaMock.providerPaymentSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'session-1',
        status: {
          in: [PaymentSessionStatus.CREATED, PaymentSessionStatus.READY],
        },
      },
      data: {
        status: PaymentSessionStatus.FAILED,
      },
    });
  });

  it('cancels the orphaned intent when the provider order does not exist inside the activation transaction', async () => {
    const txMock = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      providerOrder: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    prismaMock.$transaction.mockImplementation(
      async <T>(cb: (tx: typeof txMock) => Promise<T> | T) => cb(txMock),
    );

    await expect(
      service.activatePreparedProviderOrderPayment(buildPrepared()),
    ).rejects.toThrow('ProviderOrder not found');

    expect(stripePaymentIntentsCancel).toHaveBeenCalledWith('pi_test_123', {
      stripeAccount: 'acct_provider_1',
    });
  });

  it('rejects paid provider orders during activation and marks the session failed', async () => {
    const txMock = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      providerOrder: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'po-1',
          paymentStatus: ProviderPaymentStatus.PAID,
          reservations: [{ expiresAt: new Date('2099-01-01T01:00:00.000Z') }],
        }),
      },
    };
    prismaMock.$transaction.mockImplementation(
      async <T>(cb: (tx: typeof txMock) => Promise<T> | T) => cb(txMock),
    );

    await expect(
      service.activatePreparedProviderOrderPayment(buildPrepared()),
    ).rejects.toThrow('ProviderOrder is already paid');

    expect(prismaMock.providerPaymentSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'session-1',
        status: {
          in: [PaymentSessionStatus.CREATED, PaymentSessionStatus.READY],
        },
      },
      data: {
        status: PaymentSessionStatus.FAILED,
      },
    });
  });

  it('rejects provider orders without active reservations during activation', async () => {
    const txMock = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      providerOrder: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'po-1',
          paymentStatus: ProviderPaymentStatus.PENDING,
          reservations: [],
        }),
      },
    };
    prismaMock.$transaction.mockImplementation(
      async <T>(cb: (tx: typeof txMock) => Promise<T> | T) => cb(txMock),
    );

    await expect(
      service.activatePreparedProviderOrderPayment(buildPrepared()),
    ).rejects.toThrow(
      'ProviderOrder has no active stock reservation for payment',
    );
  });

  it('rejects provider payment sessions that are no longer eligible for activation', async () => {
    const txMock = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      providerOrder: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'po-1',
          paymentStatus: ProviderPaymentStatus.PENDING,
          reservations: [{ expiresAt: new Date('2099-01-01T01:00:00.000Z') }],
        }),
      },
      providerPaymentSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'session-1',
          status: PaymentSessionStatus.READY,
        }),
      },
    };
    prismaMock.$transaction.mockImplementation(
      async <T>(cb: (tx: typeof txMock) => Promise<T> | T) => cb(txMock),
    );

    await expect(
      service.activatePreparedProviderOrderPayment(buildPrepared()),
    ).rejects.toThrow(
      'ProviderPaymentSession is no longer eligible for activation',
    );
  });

  it('logs a warning when orphaned intent cancellation also fails', async () => {
    prismaMock.$transaction.mockRejectedValue(
      new ConflictException(
        'ProviderPaymentSession is no longer eligible for activation',
      ),
    );
    stripePaymentIntentsCancel.mockRejectedValue(new Error('cancel failed'));

    await expect(
      service.activatePreparedProviderOrderPayment(buildPrepared()),
    ).rejects.toThrow(
      'ProviderPaymentSession is no longer eligible for activation',
    );

    expect(loggerMock.warn).toHaveBeenCalledWith(
      'Failed to cancel orphaned provider payment intent pi_test_123',
    );
  });
});
