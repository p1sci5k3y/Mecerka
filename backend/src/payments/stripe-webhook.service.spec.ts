import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { StripeWebhookService } from './stripe-webhook.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  DeliveryStatus,
  PaymentAccountOwnerType,
  PaymentSessionStatus,
  ProviderOrderStatus,
  ProviderPaymentStatus,
} from '@prisma/client';

const SESSION_ID = 'cs_test_abc123';
const EVENT_ID = 'evt_test_001';
const EVENT_TYPE = 'checkout.session.completed';
const ORDER_ID = 'order-1';
const PROVIDER_ORDER_ID = 'po-1';
const PAYMENT_SESSION_ID = 'ps-1';
const PROVIDER_ID = 'provider-1';
const PRODUCT_ID = 'prod-1';
const STRIPE_ACCOUNT_ID = 'acct_provider_stripe';

// Amount = 10.00 EUR → 1000 cents
const SUBTOTAL_AMOUNT = 10.0;
const AMOUNT_CENTS = 1000;

const buildConfirmation = (overrides: any = {}) => ({
  amount: AMOUNT_CENTS,
  amountReceived: AMOUNT_CENTS,
  currency: 'eur',
  accountId: STRIPE_ACCOUNT_ID,
  metadata: {
    orderId: ORDER_ID,
    providerOrderId: PROVIDER_ORDER_ID,
    providerPaymentSessionId: PAYMENT_SESSION_ID,
  },
  ...overrides,
});

const buildPaymentSession = (overrides: any = {}) => ({
  id: PAYMENT_SESSION_ID,
  externalSessionId: SESSION_ID,
  providerOrderId: PROVIDER_ORDER_ID,
  status: PaymentSessionStatus.READY,
  providerOrder: {
    items: [{ productId: PRODUCT_ID, quantity: 1 }],
  },
  ...overrides,
});

const buildProviderOrder = (overrides: any = {}) => ({
  id: PROVIDER_ORDER_ID,
  providerId: PROVIDER_ID,
  subtotalAmount: SUBTOTAL_AMOUNT,
  paymentRef: null,
  paymentStatus: 'PENDING',
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

const buildRefreshedOrder = (allPaid = true) => ({
  id: ORDER_ID,
  status: DeliveryStatus.PENDING,
  providerOrders: [
    {
      id: PROVIDER_ORDER_ID,
      paymentStatus: allPaid ? ProviderPaymentStatus.PAID : 'PENDING',
    },
  ],
});

describe('StripeWebhookService', () => {
  let service: StripeWebhookService;
  let prismaMock: any;
  let eventEmitterMock: any;

  beforeEach(async () => {
    prismaMock = {
      paymentWebhookEvent: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      paymentAccount: {
        findFirst: jest.fn(),
        upsert: jest.fn(),
      },
      user: { findUnique: jest.fn() },
      order: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };

    eventEmitterMock = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeWebhookService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: EventEmitter2, useValue: eventEmitterMock },
      ],
    }).compile();

    service = module.get<StripeWebhookService>(StripeWebhookService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── Helper: full transaction mock ────────────────────────────────────────

  function setupSuccessfulTransaction() {
    prismaMock.paymentWebhookEvent.create.mockResolvedValue({});
    prismaMock.paymentWebhookEvent.update.mockResolvedValue({});

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
        findUnique: jest.fn().mockResolvedValue(buildRefreshedOrder(true)),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    prismaMock.$transaction.mockImplementation((cb: any) => cb(txMock));
    return txMock;
  }

  // ─── 1. confirmPayment — happy path ──────────────────────────────────────

  describe('confirmPayment', () => {
    it('procesa evento checkout.session.completed correctamente', async () => {
      setupSuccessfulTransaction();

      const result = await service.confirmProviderOrderPayment(
        SESSION_ID,
        EVENT_ID,
        EVENT_TYPE,
        buildConfirmation(),
      );

      expect(result).toMatchObject({
        success: true,
        orderId: ORDER_ID,
        providerOrderId: PROVIDER_ORDER_ID,
        paymentStatus: ProviderPaymentStatus.PAID,
      });

      // Order state change event should be emitted
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        'order.stateChanged',
        expect.objectContaining({ orderId: ORDER_ID }),
      );

      // Webhook event should be marked PROCESSED
      expect(prismaMock.paymentWebhookEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PROCESSED' }),
        }),
      );
    });

    // ─── 2. idempotencia ────────────────────────────────────────────────────

    it('es idempotente: retorna early si el evento ya está reclamado', async () => {
      // claimWebhookEvent: create throws P2002 AND updateMany returns count=0
      // (event is in PROCESSED state, not FAILED or stale RECEIVED)
      prismaMock.paymentWebhookEvent.create.mockRejectedValue({
        code: 'P2002',
      });
      prismaMock.paymentWebhookEvent.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.confirmProviderOrderPayment(
        SESSION_ID,
        EVENT_ID,
        EVENT_TYPE,
        buildConfirmation(),
      );

      expect(result).toEqual({ message: 'Webhook already processed' });
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    // ─── 3. legacy confirmPayment lanza ConflictException ───────────────────

    it('lanza ConflictException al usar el wrapper legacy (disabled)', async () => {
      // The legacy confirmPayment() wrapper is permanently disabled.
      // It always throws ConflictException regardless of event state.
      prismaMock.paymentWebhookEvent.findUnique.mockResolvedValue(null);
      prismaMock.order.findUnique.mockResolvedValue({
        id: ORDER_ID,
        providerOrders: [{ id: PROVIDER_ORDER_ID }],
      });

      await expect(
        service.confirmPayment(ORDER_ID, SESSION_ID, EVENT_ID),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── 4. claimWebhookEvent: retorna true ──────────────────────────────────

  describe('claimWebhookEvent', () => {
    it('retorna true y procesa el evento si logra reclamar el evento', async () => {
      // When paymentWebhookEvent.create succeeds (no conflict), the event is claimed
      // and confirmProviderOrderPayment proceeds with the full transaction.
      setupSuccessfulTransaction();

      const result = await service.confirmProviderOrderPayment(
        SESSION_ID,
        EVENT_ID,
        EVENT_TYPE,
        buildConfirmation(),
      );

      // create was called once (successful claim)
      expect(prismaMock.paymentWebhookEvent.create).toHaveBeenCalledTimes(1);
      expect(result).toHaveProperty('success', true);
    });

    // ─── 5. claimWebhookEvent: retorna false ──────────────────────────────

    it('retorna false y no procesa si el evento ya está reclamado por otro proceso', async () => {
      // Simulate P2002 (duplicate key) AND event is in an unrecoverable state
      // → updateMany returns count=0 → claimWebhookEvent returns false → early return
      prismaMock.paymentWebhookEvent.create.mockRejectedValue({
        code: 'P2002',
      });
      prismaMock.paymentWebhookEvent.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.confirmProviderOrderPayment(
        SESSION_ID,
        `${EVENT_ID}_concurrent`,
        EVENT_TYPE,
        buildConfirmation(),
      );

      expect(result).toEqual({ message: 'Webhook already processed' });
      // Transaction should never be entered
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });

  // ─── 6. markWebhookEventStatus → PROCESSED ───────────────────────────────

  describe('markWebhookEventStatus', () => {
    it('actualiza el estado del evento a PROCESSED tras completar correctamente', async () => {
      setupSuccessfulTransaction();

      await service.confirmProviderOrderPayment(
        SESSION_ID,
        EVENT_ID,
        EVENT_TYPE,
        buildConfirmation(),
      );

      expect(prismaMock.paymentWebhookEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: EVENT_ID },
          data: expect.objectContaining({ status: 'PROCESSED' }),
        }),
      );
    });

    // ─── 7. markWebhookEventStatus → FAILED ─────────────────────────────────

    it('actualiza el estado del evento a FAILED cuando la transacción lanza un error', async () => {
      prismaMock.paymentWebhookEvent.create.mockResolvedValue({});
      prismaMock.paymentWebhookEvent.update.mockResolvedValue({});

      // Transaction throws NotFoundException (payment session not found)
      prismaMock.$transaction.mockRejectedValue(
        new NotFoundException('Payment session not found'),
      );

      await expect(
        service.confirmProviderOrderPayment(
          'sess_nonexistent',
          EVENT_ID,
          EVENT_TYPE,
          buildConfirmation(),
        ),
      ).rejects.toThrow(NotFoundException);

      // Even after failure, the webhook event status must be updated to FAILED
      expect(prismaMock.paymentWebhookEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: EVENT_ID },
          data: expect.objectContaining({ status: 'FAILED' }),
        }),
      );
    });
  });
});
