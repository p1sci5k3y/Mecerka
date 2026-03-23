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
});
