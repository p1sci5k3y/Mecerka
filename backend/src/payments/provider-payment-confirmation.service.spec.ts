import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import {
  DeliveryStatus,
  PaymentSessionStatus,
  ProviderOrderStatus,
  ProviderPaymentStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProviderPaymentConfirmationService } from './provider-payment-confirmation.service';
import { PaymentConfirmationPayload } from './provider-payment-confirmation.types';

const SESSION_ID = 'cs_test_abc123';
const ORDER_ID = 'order-1';
const PROVIDER_ORDER_ID = 'po-1';
const PAYMENT_SESSION_ID = 'ps-1';
const PROVIDER_ID = 'provider-1';
const PRODUCT_ID = 'prod-1';
const STRIPE_ACCOUNT_ID = 'acct_provider_stripe';

const buildConfirmation = (
  overrides: Partial<PaymentConfirmationPayload> = {},
): PaymentConfirmationPayload => ({
  amount: 1000,
  amountReceived: 1000,
  currency: 'eur',
  accountId: STRIPE_ACCOUNT_ID,
  metadata: {
    orderId: ORDER_ID,
    providerOrderId: PROVIDER_ORDER_ID,
    providerPaymentSessionId: PAYMENT_SESSION_ID,
  },
  ...overrides,
});

const buildPaymentSession = (overrides: Record<string, unknown> = {}) => ({
  id: PAYMENT_SESSION_ID,
  externalSessionId: SESSION_ID,
  providerOrderId: PROVIDER_ORDER_ID,
  status: PaymentSessionStatus.READY,
  providerOrder: {
    items: [{ productId: PRODUCT_ID, quantity: 1 }],
  },
  ...overrides,
});

const buildProviderOrder = (overrides: Record<string, unknown> = {}) => ({
  id: PROVIDER_ORDER_ID,
  providerId: PROVIDER_ID,
  subtotalAmount: 10,
  paymentRef: null,
  paymentStatus: ProviderPaymentStatus.PENDING,
  status: ProviderOrderStatus.PENDING,
  order: { id: ORDER_ID, status: DeliveryStatus.PENDING },
  reservations: [
    {
      id: 'res-1',
      productId: PRODUCT_ID,
      quantity: 1,
      expiresAt: new Date(Date.now() + 900_000),
    },
  ],
  items: [{ productId: PRODUCT_ID, quantity: 1 }],
  ...overrides,
});

describe('ProviderPaymentConfirmationService', () => {
  let service: ProviderPaymentConfirmationService;
  let prismaMock: {
    paymentAccount: { upsert: jest.Mock };
    $transaction: jest.Mock;
  };

  function setupSuccessfulTransaction() {
    const txMock = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      providerPaymentSession: {
        findUnique: jest.fn().mockResolvedValue(buildPaymentSession()),
        update: jest.fn().mockResolvedValue({}),
      },
      providerOrder: {
        findUnique: jest.fn().mockResolvedValue(buildProviderOrder()),
        update: jest.fn().mockResolvedValue({}),
      },
      paymentAccount: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ externalAccountId: STRIPE_ACCOUNT_ID }),
      },
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      stockReservation: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      product: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: ORDER_ID,
          status: DeliveryStatus.PENDING,
          providerOrders: [
            {
              id: PROVIDER_ORDER_ID,
              paymentStatus: ProviderPaymentStatus.PAID,
            },
          ],
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    prismaMock.$transaction.mockImplementation(
      async <T>(cb: (tx: typeof txMock) => Promise<T> | T) => cb(txMock),
    );
    return txMock;
  }

  beforeEach(async () => {
    prismaMock = {
      paymentAccount: { upsert: jest.fn() },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProviderPaymentConfirmationService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<ProviderPaymentConfirmationService>(
      ProviderPaymentConfirmationService,
    );
  });

  it('confirms the provider payment and emits completion data', async () => {
    const txMock = setupSuccessfulTransaction();

    const result = await service.confirmProviderOrderPayment(
      SESSION_ID,
      'evt_ok',
      buildConfirmation(),
    );

    expect(result).toMatchObject({
      success: true,
      orderId: ORDER_ID,
      providerOrderId: PROVIDER_ORDER_ID,
      paymentStatus: ProviderPaymentStatus.PAID,
    });
    expect(txMock.providerPaymentSession.update).toHaveBeenCalled();
    expect(txMock.providerOrder.update).toHaveBeenCalled();
  });

  it('returns early when the payment session is already completed', async () => {
    const txMock = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      providerPaymentSession: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            buildPaymentSession({ status: PaymentSessionStatus.COMPLETED }),
          ),
        update: jest.fn().mockResolvedValue({}),
      },
      providerOrder: {
        findUnique: jest.fn().mockResolvedValue(buildProviderOrder()),
        update: jest.fn().mockResolvedValue({}),
      },
      paymentAccount: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ externalAccountId: STRIPE_ACCOUNT_ID }),
      },
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      stockReservation: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      product: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      order: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    prismaMock.$transaction.mockImplementation(
      async <T>(cb: (tx: typeof txMock) => Promise<T> | T) => cb(txMock),
    );

    await expect(
      service.confirmProviderOrderPayment(
        SESSION_ID,
        'evt_completed',
        buildConfirmation(),
      ),
    ).resolves.toMatchObject({
      message: 'Provider payment session already completed',
    });
  });

  it('rejects a mismatched confirmed amount', async () => {
    setupSuccessfulTransaction();

    await expect(
      service.confirmProviderOrderPayment(
        SESSION_ID,
        'evt_bad_amount',
        buildConfirmation({ amountReceived: 9999 }),
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects confirmation when the payment session does not exist', async () => {
    const txMock = {
      providerPaymentSession: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    prismaMock.$transaction.mockImplementation(
      async <T>(cb: (tx: typeof txMock) => Promise<T> | T) => cb(txMock),
    );

    await expect(
      service.confirmProviderOrderPayment(
        SESSION_ID,
        'evt_missing_session',
        buildConfirmation(),
      ),
    ).rejects.toThrow('Payment session not found');
  });

  it('rejects inactive failed payment sessions', async () => {
    const txMock = {
      providerPaymentSession: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            buildPaymentSession({ status: PaymentSessionStatus.FAILED }),
          ),
      },
    };
    prismaMock.$transaction.mockImplementation(
      async <T>(cb: (tx: typeof txMock) => Promise<T> | T) => cb(txMock),
    );

    await expect(
      service.confirmProviderOrderPayment(
        SESSION_ID,
        'evt_failed_session',
        buildConfirmation(),
      ),
    ).rejects.toThrow('Inactive payment session cannot be confirmed');
  });

  it('rejects inactive expired payment sessions', async () => {
    const txMock = {
      providerPaymentSession: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            buildPaymentSession({ status: PaymentSessionStatus.EXPIRED }),
          ),
      },
    };
    prismaMock.$transaction.mockImplementation(
      async <T>(cb: (tx: typeof txMock) => Promise<T> | T) => cb(txMock),
    );

    await expect(
      service.confirmProviderOrderPayment(
        SESSION_ID,
        'evt_expired_session',
        buildConfirmation(),
      ),
    ).rejects.toThrow('Inactive payment session cannot be confirmed');
  });

  it('rejects superseded payment references', async () => {
    const txMock = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      providerPaymentSession: {
        findUnique: jest.fn().mockResolvedValue(buildPaymentSession()),
      },
      providerOrder: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            buildProviderOrder({ paymentRef: 'pi_other_superseding' }),
          ),
      },
    };
    prismaMock.$transaction.mockImplementation(
      async <T>(cb: (tx: typeof txMock) => Promise<T> | T) => cb(txMock),
    );

    await expect(
      service.confirmProviderOrderPayment(
        SESSION_ID,
        'evt_superseded',
        buildConfirmation(),
      ),
    ).rejects.toThrow('Superseded payment session cannot be confirmed');
  });

  it('returns early when the provider order is already paid', async () => {
    const txMock = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      providerPaymentSession: {
        findUnique: jest.fn().mockResolvedValue(buildPaymentSession()),
      },
      providerOrder: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            buildProviderOrder({ paymentStatus: ProviderPaymentStatus.PAID }),
          ),
      },
    };
    prismaMock.$transaction.mockImplementation(
      async <T>(cb: (tx: typeof txMock) => Promise<T> | T) => cb(txMock),
    );

    await expect(
      service.confirmProviderOrderPayment(
        SESSION_ID,
        'evt_already_paid',
        buildConfirmation(),
      ),
    ).resolves.toMatchObject({
      message: 'ProviderOrder already paid',
    });
  });

  it('rejects when the provider order cannot be found after locking', async () => {
    const txMock = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      providerPaymentSession: {
        findUnique: jest.fn().mockResolvedValue(buildPaymentSession()),
      },
      providerOrder: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    prismaMock.$transaction.mockImplementation(
      async <T>(cb: (tx: typeof txMock) => Promise<T> | T) => cb(txMock),
    );

    await expect(
      service.confirmProviderOrderPayment(
        SESSION_ID,
        'evt_missing_provider_order',
        buildConfirmation(),
      ),
    ).rejects.toThrow('ProviderOrder not found');
  });

  it('rejects when the provider order has no active reservations', async () => {
    const txMock = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      providerPaymentSession: {
        findUnique: jest.fn().mockResolvedValue(buildPaymentSession()),
      },
      providerOrder: {
        findUnique: jest
          .fn()
          .mockResolvedValue(buildProviderOrder({ reservations: [] })),
      },
    };
    prismaMock.$transaction.mockImplementation(
      async <T>(cb: (tx: typeof txMock) => Promise<T> | T) => cb(txMock),
    );

    await expect(
      service.confirmProviderOrderPayment(
        SESSION_ID,
        'evt_no_reservations',
        buildConfirmation(),
      ),
    ).rejects.toThrow('ProviderOrder has no active reservations to consume');
  });

  it('rejects missing confirmation payloads', async () => {
    setupSuccessfulTransaction();

    await expect(
      service.confirmProviderOrderPayment(SESSION_ID, 'evt_missing_payload'),
    ).rejects.toThrow(
      'Payment confirmation payload is required for provider payment verification',
    );
  });

  it('falls back to user stripeAccountId and upserts the active payment account', async () => {
    const txMock = setupSuccessfulTransaction();
    txMock.paymentAccount.findFirst.mockResolvedValue(null);
    txMock.user.findUnique.mockResolvedValue({
      stripeAccountId: STRIPE_ACCOUNT_ID,
    });
    prismaMock.paymentAccount.upsert.mockResolvedValue({
      externalAccountId: STRIPE_ACCOUNT_ID,
      isActive: true,
    });

    const result = await service.confirmProviderOrderPayment(
      SESSION_ID,
      'evt_upsert_account',
      buildConfirmation(),
    );

    expect(prismaMock.paymentAccount.upsert).toHaveBeenCalledWith({
      where: {
        ownerType_ownerId_provider: {
          ownerType: 'PROVIDER',
          ownerId: PROVIDER_ID,
          provider: 'STRIPE',
        },
      },
      update: {
        externalAccountId: STRIPE_ACCOUNT_ID,
        isActive: true,
      },
      create: {
        ownerType: 'PROVIDER',
        ownerId: PROVIDER_ID,
        provider: 'STRIPE',
        externalAccountId: STRIPE_ACCOUNT_ID,
        isActive: true,
      },
    });
    expect(result).toMatchObject({
      success: true,
      providerOrderId: PROVIDER_ORDER_ID,
    });
  });

  it('rejects when no active payment account can be resolved', async () => {
    const txMock = setupSuccessfulTransaction();
    txMock.paymentAccount.findFirst.mockResolvedValue(null);
    txMock.user.findUnique.mockResolvedValue(null);

    await expect(
      service.confirmProviderOrderPayment(
        SESSION_ID,
        'evt_missing_account',
        buildConfirmation(),
      ),
    ).rejects.toThrow(
      'Provider payment account is not active for this provider order',
    );
  });

  it('accepts confirmations that only provide amount as fallback', async () => {
    setupSuccessfulTransaction();

    await expect(
      service.confirmProviderOrderPayment(
        SESSION_ID,
        'evt_amount_fallback',
        buildConfirmation({ amountReceived: undefined, amount: 1000 }),
      ),
    ).resolves.toMatchObject({
      success: true,
      providerOrderId: PROVIDER_ORDER_ID,
    });
  });

  it('rejects confirmations without amountReceived or amount', async () => {
    setupSuccessfulTransaction();

    await expect(
      service.confirmProviderOrderPayment(
        SESSION_ID,
        'evt_missing_amounts',
        buildConfirmation({
          amountReceived: undefined,
          amount: undefined,
        }),
      ),
    ).rejects.toThrow(
      'Payment amount does not match the expected provider order subtotal',
    );
  });

  it('rejects incomplete provider payment metadata', async () => {
    setupSuccessfulTransaction();

    await expect(
      service.confirmProviderOrderPayment(
        SESSION_ID,
        'evt_missing_metadata',
        buildConfirmation({
          metadata: {
            orderId: ORDER_ID,
            providerOrderId: PROVIDER_ORDER_ID,
          },
        } as Partial<PaymentConfirmationPayload>),
      ),
    ).rejects.toThrow(
      'Payment metadata is incomplete for provider payment verification',
    );
  });

  it('rejects mismatched metadata order ids', async () => {
    setupSuccessfulTransaction();

    await expect(
      service.confirmProviderOrderPayment(
        SESSION_ID,
        'evt_order_id_mismatch',
        buildConfirmation({
          metadata: {
            orderId: 'wrong-order',
            providerOrderId: PROVIDER_ORDER_ID,
            providerPaymentSessionId: PAYMENT_SESSION_ID,
          },
        }),
      ),
    ).rejects.toThrow('Payment metadata orderId mismatch');
  });

  it('rejects mismatched metadata provider order ids', async () => {
    setupSuccessfulTransaction();

    await expect(
      service.confirmProviderOrderPayment(
        SESSION_ID,
        'evt_provider_order_id_mismatch',
        buildConfirmation({
          metadata: {
            orderId: ORDER_ID,
            providerOrderId: 'wrong-provider-order',
            providerPaymentSessionId: PAYMENT_SESSION_ID,
          },
        }),
      ),
    ).rejects.toThrow('Payment metadata providerOrderId mismatch');
  });

  it('rejects mismatched metadata payment session ids', async () => {
    setupSuccessfulTransaction();

    await expect(
      service.confirmProviderOrderPayment(
        SESSION_ID,
        'evt_session_id_mismatch',
        buildConfirmation({
          metadata: {
            orderId: ORDER_ID,
            providerOrderId: PROVIDER_ORDER_ID,
            providerPaymentSessionId: 'wrong-session',
          },
        }),
      ),
    ).rejects.toThrow('Payment metadata providerPaymentSessionId mismatch');
  });
});
