import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  PaymentAccountOwnerType,
  PaymentAccountProvider,
  ProviderPaymentStatus,
  Role,
  RunnerPaymentStatus,
} from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { RiskService } from '../risk/risk.service';
import { RefundStatusValues, RefundTypeValues } from './refund.constants';
import { RefundsService } from './refunds.service';

jest.mock('stripe');

describe('RefundsService', () => {
  let service: RefundsService;
  let prismaMock: any;
  let riskServiceMock: any;
  let stripeRefundsCreate: jest.Mock;

  beforeEach(async () => {
    stripeRefundsCreate = jest.fn().mockResolvedValue({
      id: 're_test_123',
    });

    (Stripe as unknown as jest.Mock).mockImplementation(() => ({
      refunds: {
        create: stripeRefundsCreate,
      },
    }));

    prismaMock = {
      refundRequest: {
        count: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        aggregate: jest.fn(),
      },
      providerOrder: {
        findUnique: jest.fn(),
      },
      deliveryOrder: {
        findUnique: jest.fn(),
      },
      deliveryIncident: {
        findUnique: jest.fn(),
      },
      paymentAccount: {
        findFirst: jest.fn(),
        upsert: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    riskServiceMock = {
      recordRiskEvent: jest.fn().mockResolvedValue({
        created: true,
      }),
      recalculateRiskScore: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefundsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: RiskService, useValue: riskServiceMock },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'STRIPE_SECRET_KEY' ? 'sk_test_dummy' : undefined,
            ),
          },
        },
      ],
    }).compile();

    service = module.get<RefundsService>(RefundsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('rejects provider refunds that exceed the captured amount', async () => {
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        providerOrder: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'po-1',
            providerId: 'provider-1',
            subtotalAmount: 50,
            paymentRef: 'pi_provider_1',
            paymentStatus: ProviderPaymentStatus.PAID,
            order: {
              id: 'order-1',
              clientId: 'client-1',
              deliveryOrder: { id: 'delivery-1' },
            },
          }),
        },
        deliveryOrder: {
          findUnique: jest.fn(),
        },
        deliveryIncident: {
          findUnique: jest.fn(),
        },
        refundRequest: {
          count: jest.fn().mockResolvedValue(0),
          aggregate: jest.fn().mockResolvedValue({
            _sum: { amount: 10 },
          }),
          create: jest.fn(),
        },
      }),
    );

    await expect(
      service.requestRefund(
        {
          providerOrderId: 'po-1',
          type: RefundTypeValues.PROVIDER_PARTIAL,
          amount: 45,
          currency: 'EUR',
        },
        'client-1',
        [Role.CLIENT],
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('allows cumulative partial refunds only up to the captured amount', async () => {
    const txRefundCreate = jest.fn().mockImplementation(({ data }: any) => ({
      id: 'refund-1',
      createdAt: new Date(),
      reviewedAt: null,
      completedAt: null,
      reviewedById: null,
      externalRefundId: null,
      ...data,
    }));

    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        providerOrder: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'po-1',
            providerId: 'provider-1',
            subtotalAmount: 50,
            paymentRef: 'pi_provider_1',
            paymentStatus: ProviderPaymentStatus.PAID,
            order: {
              id: 'order-1',
              clientId: 'client-1',
              deliveryOrder: { id: 'delivery-1' },
            },
          }),
        },
        deliveryOrder: {
          findUnique: jest.fn(),
        },
        deliveryIncident: {
          findUnique: jest.fn(),
        },
        refundRequest: {
          count: jest.fn().mockResolvedValue(1),
          aggregate: jest.fn().mockResolvedValue({
            _sum: { amount: 20 },
          }),
          create: txRefundCreate,
        },
      }),
    );

    const refund = await service.requestRefund(
      {
        providerOrderId: 'po-1',
        type: RefundTypeValues.PROVIDER_PARTIAL,
        amount: 15,
        currency: 'EUR',
      },
      'client-1',
      [Role.CLIENT],
    );

    expect(refund.amount).toBe(15);
    expect(txRefundCreate).toHaveBeenCalled();
  });

  it('emits a refund-abuse risk event when a client creates a refund request', async () => {
    const createdAt = new Date('2099-01-01T00:00:00.000Z');

    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        providerOrder: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'po-1',
            providerId: 'provider-1',
            subtotalAmount: 50,
            paymentRef: 'pi_provider_1',
            paymentStatus: ProviderPaymentStatus.PAID,
            order: {
              id: 'order-1',
              clientId: 'client-1',
              deliveryOrder: { id: 'delivery-1' },
            },
          }),
        },
        deliveryOrder: {
          findUnique: jest.fn(),
        },
        deliveryIncident: {
          findUnique: jest.fn(),
        },
        refundRequest: {
          count: jest.fn().mockResolvedValue(0),
          aggregate: jest.fn().mockResolvedValue({
            _sum: { amount: 0 },
          }),
          create: jest.fn().mockResolvedValue({
            id: 'refund-1',
            incidentId: null,
            providerOrderId: 'po-1',
            deliveryOrderId: null,
            type: RefundTypeValues.PROVIDER_PARTIAL,
            status: RefundStatusValues.REQUESTED,
            amount: 15,
            currency: 'EUR',
            requestedById: 'client-1',
            reviewedById: null,
            externalRefundId: null,
            createdAt,
            reviewedAt: null,
            completedAt: null,
          }),
        },
      }),
    );

    await service.requestRefund(
      {
        providerOrderId: 'po-1',
        type: RefundTypeValues.PROVIDER_PARTIAL,
        amount: 15,
        currency: 'EUR',
      },
      'client-1',
      [Role.CLIENT],
    );

    expect(riskServiceMock.recordRiskEvent).toHaveBeenCalledWith({
      actorType: 'CLIENT',
      actorId: 'client-1',
      category: 'CLIENT_REFUND_ABUSE',
      score: 12,
      dedupKey: 'refund-abuse:refund-1',
      metadata: {
        refundRequestId: 'refund-1',
        boundaryId: 'po-1',
      },
    });
    expect(riskServiceMock.recalculateRiskScore).toHaveBeenCalledWith(
      'CLIENT',
      'client-1',
    );
  });

  it('does not execute the same refund twice', async () => {
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        $executeRaw: jest.fn(),
        refundRequest: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'refund-1',
            status: RefundStatusValues.COMPLETED,
            providerOrderId: 'po-1',
            deliveryOrderId: null,
            amount: 10,
            currency: 'EUR',
            requestedById: 'client-1',
            reviewedById: 'admin-1',
            externalRefundId: 're_test_123',
            createdAt: new Date(),
            reviewedAt: new Date(),
            completedAt: new Date(),
          }),
        },
      }),
    );

    const result = await service.executeRefund('refund-1', 'admin-1', [
      Role.ADMIN,
    ]);

    expect(result.status).toBe(RefundStatusValues.COMPLETED);
    expect(stripeRefundsCreate).not.toHaveBeenCalled();
  });

  it('executes a provider refund without touching delivery payments', async () => {
    const txProviderOrderFindUnique = jest.fn().mockResolvedValue({
      id: 'po-1',
      providerId: 'provider-1',
      subtotalAmount: 50,
      paymentRef: 'pi_provider_1',
      paymentStatus: ProviderPaymentStatus.PAID,
      order: {
        id: 'order-1',
        clientId: 'client-1',
        deliveryOrder: { id: 'delivery-1' },
      },
    });
    const txRefundUpdate = jest
      .fn()
      .mockImplementation(({ data }: any) => ({ id: 'refund-1', ...data }));

    prismaMock.paymentAccount.findFirst.mockResolvedValue({
      id: 'pa-1',
      ownerType: PaymentAccountOwnerType.PROVIDER,
      ownerId: 'provider-1',
      provider: PaymentAccountProvider.STRIPE,
      externalAccountId: 'acct_provider_1',
      isActive: true,
    });

    prismaMock.$transaction
      .mockImplementationOnce(async (callback: any) =>
        callback({
          $executeRaw: jest.fn(),
          refundRequest: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'refund-1',
              status: RefundStatusValues.APPROVED,
              providerOrderId: 'po-1',
              deliveryOrderId: null,
              amount: 20,
              currency: 'EUR',
              requestedById: 'client-1',
              reviewedById: 'admin-1',
              reviewedAt: new Date(),
            }),
            update: txRefundUpdate,
            aggregate: jest.fn().mockResolvedValue({
              _sum: { amount: 0 },
            }),
          },
          providerOrder: {
            findUnique: txProviderOrderFindUnique,
          },
          deliveryOrder: {
            findUnique: jest.fn(),
          },
        }),
      )
      .mockImplementationOnce(async (callback: any) =>
        callback({
          $executeRaw: jest.fn(),
          refundRequest: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'refund-1',
              status: RefundStatusValues.EXECUTING,
              providerOrderId: 'po-1',
              deliveryOrderId: null,
              amount: 20,
              currency: 'EUR',
              requestedById: 'client-1',
              reviewedById: 'admin-1',
              reviewedAt: new Date(),
            }),
            update: txRefundUpdate,
          },
        }),
      );

    const refund = await service.executeRefund('refund-1', 'admin-1', [
      Role.ADMIN,
    ]);

    expect(stripeRefundsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_intent: 'pi_provider_1',
        amount: 2000,
      }),
      expect.objectContaining({
        stripeAccount: 'acct_provider_1',
        idempotencyKey: 'refund-request:refund-1',
      }),
    );
    expect(refund.status).toBe(RefundStatusValues.COMPLETED);
    expect(txProviderOrderFindUnique).toHaveBeenCalled();
  });

  it('executes a delivery refund without touching provider payments', async () => {
    const txDeliveryOrderFindUnique = jest.fn().mockResolvedValue({
      id: 'delivery-1',
      runnerId: 'runner-1',
      deliveryFee: 8.5,
      currency: 'EUR',
      paymentRef: 'pi_delivery_1',
      paymentStatus: RunnerPaymentStatus.PAID,
      order: {
        clientId: 'client-1',
      },
    });
    const txRefundUpdate = jest
      .fn()
      .mockImplementation(({ data }: any) => ({ id: 'refund-1', ...data }));

    prismaMock.paymentAccount.findFirst.mockResolvedValue({
      id: 'pa-1',
      ownerType: PaymentAccountOwnerType.RUNNER,
      ownerId: 'runner-1',
      provider: PaymentAccountProvider.STRIPE,
      externalAccountId: 'acct_runner_1',
      isActive: true,
    });

    prismaMock.$transaction
      .mockImplementationOnce(async (callback: any) =>
        callback({
          $executeRaw: jest.fn(),
          refundRequest: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'refund-1',
              status: RefundStatusValues.APPROVED,
              providerOrderId: null,
              deliveryOrderId: 'delivery-1',
              amount: 4.25,
              currency: 'EUR',
              requestedById: 'client-1',
              reviewedById: 'admin-1',
              reviewedAt: new Date(),
            }),
            update: txRefundUpdate,
            aggregate: jest.fn().mockResolvedValue({
              _sum: { amount: 0 },
            }),
          },
          providerOrder: {
            findUnique: jest.fn(),
          },
          deliveryOrder: {
            findUnique: txDeliveryOrderFindUnique,
          },
        }),
      )
      .mockImplementationOnce(async (callback: any) =>
        callback({
          $executeRaw: jest.fn(),
          refundRequest: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'refund-1',
              status: RefundStatusValues.EXECUTING,
              providerOrderId: null,
              deliveryOrderId: 'delivery-1',
              amount: 4.25,
              currency: 'EUR',
              requestedById: 'client-1',
              reviewedById: 'admin-1',
              reviewedAt: new Date(),
            }),
            update: txRefundUpdate,
          },
        }),
      );

    const refund = await service.executeRefund('refund-1', 'admin-1', [
      Role.ADMIN,
    ]);

    expect(stripeRefundsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_intent: 'pi_delivery_1',
        amount: 425,
      }),
      expect.objectContaining({
        stripeAccount: 'acct_runner_1',
        idempotencyKey: 'refund-request:refund-1',
      }),
    );
    expect(refund.status).toBe(RefundStatusValues.COMPLETED);
    expect(txDeliveryOrderFindUnique).toHaveBeenCalled();
  });

  it('prevents non-admin actors from approving refunds', async () => {
    await expect(
      service.approveRefund('refund-1', 'provider-1', [Role.PROVIDER]),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects requests that do not reference a provider or delivery boundary', async () => {
    await expect(
      service.requestRefund(
        {
          type: RefundTypeValues.PROVIDER_PARTIAL,
          amount: 5,
          currency: 'EUR',
        },
        'client-1',
        [Role.CLIENT],
      ),
    ).rejects.toThrow(BadRequestException);
  });

  // ─── branch coverage additions ────────────────────────────────────────────

  describe('branch coverage', () => {
    const makeProviderBoundary = (overrides = {}) => ({
      id: 'po-1',
      providerId: 'provider-1',
      subtotalAmount: 50,
      paymentRef: 'pi_provider_1',
      paymentStatus: ProviderPaymentStatus.PAID,
      order: {
        id: 'order-1',
        clientId: 'client-1',
        deliveryOrder: { id: 'delivery-1' },
      },
      ...overrides,
    });

    const makeDeliveryBoundary = (overrides = {}) => ({
      id: 'delivery-1',
      runnerId: 'runner-1',
      deliveryFee: 8.5,
      currency: 'EUR',
      paymentRef: 'pi_delivery_1',
      paymentStatus: RunnerPaymentStatus.PAID,
      order: { clientId: 'client-1' },
      ...overrides,
    });

    describe('requestRefund – boundary validation', () => {
      it('throws BadRequestException when both providerOrderId and deliveryOrderId are provided', async () => {
        await expect(
          service.requestRefund(
            {
              providerOrderId: 'po-1',
              deliveryOrderId: 'delivery-1',
              type: RefundTypeValues.PROVIDER_PARTIAL,
              amount: 10,
              currency: 'EUR',
            },
            'client-1',
            [Role.CLIENT],
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('throws ForbiddenException when non-owner client tries to request refund', async () => {
        prismaMock.$transaction.mockImplementation(async (cb: any) =>
          cb({
            providerOrder: {
              findUnique: jest.fn().mockResolvedValue(makeProviderBoundary()),
            },
            deliveryOrder: { findUnique: jest.fn() },
            deliveryIncident: { findUnique: jest.fn() },
            refundRequest: {
              count: jest.fn().mockResolvedValue(0),
              aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
            },
          }),
        );

        await expect(
          service.requestRefund(
            {
              providerOrderId: 'po-1',
              type: RefundTypeValues.PROVIDER_PARTIAL,
              amount: 10,
              currency: 'EUR',
            },
            'other-client',
            [Role.CLIENT],
          ),
        ).rejects.toThrow(ForbiddenException);
      });

      it('throws ConflictException when ProviderOrder is not PAID', async () => {
        prismaMock.$transaction.mockImplementation(async (cb: any) =>
          cb({
            providerOrder: {
              findUnique: jest.fn().mockResolvedValue(
                makeProviderBoundary({
                  paymentStatus: ProviderPaymentStatus.PENDING,
                }),
              ),
            },
            deliveryOrder: { findUnique: jest.fn() },
            deliveryIncident: { findUnique: jest.fn() },
            refundRequest: {
              count: jest.fn().mockResolvedValue(0),
              aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
            },
          }),
        );

        await expect(
          service.requestRefund(
            {
              providerOrderId: 'po-1',
              type: RefundTypeValues.PROVIDER_PARTIAL,
              amount: 10,
              currency: 'EUR',
            },
            'client-1',
            [Role.CLIENT],
          ),
        ).rejects.toThrow(ConflictException);
      });

      it('throws BadRequestException when currency does not match', async () => {
        prismaMock.$transaction.mockImplementation(async (cb: any) =>
          cb({
            providerOrder: {
              findUnique: jest.fn().mockResolvedValue(makeProviderBoundary()),
            },
            deliveryOrder: { findUnique: jest.fn() },
            deliveryIncident: { findUnique: jest.fn() },
            refundRequest: {
              count: jest.fn().mockResolvedValue(0),
              aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
            },
          }),
        );

        await expect(
          service.requestRefund(
            {
              providerOrderId: 'po-1',
              type: RefundTypeValues.PROVIDER_PARTIAL,
              amount: 10,
              currency: 'USD', // wrong currency
            },
            'client-1',
            [Role.CLIENT],
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('throws BadRequestException when wrong refund type is used for provider order', async () => {
        prismaMock.$transaction.mockImplementation(async (cb: any) =>
          cb({
            providerOrder: {
              findUnique: jest.fn().mockResolvedValue(makeProviderBoundary()),
            },
            deliveryOrder: { findUnique: jest.fn() },
            deliveryIncident: { findUnique: jest.fn() },
            refundRequest: {
              count: jest.fn().mockResolvedValue(0),
              aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
            },
          }),
        );

        await expect(
          service.requestRefund(
            {
              providerOrderId: 'po-1',
              type: RefundTypeValues.DELIVERY_PARTIAL, // wrong type for provider
              amount: 10,
              currency: 'EUR',
            },
            'client-1',
            [Role.CLIENT],
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('throws BadRequestException when full refund amount does not match captured amount', async () => {
        prismaMock.$transaction.mockImplementation(async (cb: any) =>
          cb({
            providerOrder: {
              findUnique: jest.fn().mockResolvedValue(makeProviderBoundary()),
            },
            deliveryOrder: { findUnique: jest.fn() },
            deliveryIncident: { findUnique: jest.fn() },
            refundRequest: {
              count: jest.fn().mockResolvedValue(0),
              aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
            },
          }),
        );

        await expect(
          service.requestRefund(
            {
              providerOrderId: 'po-1',
              type: RefundTypeValues.PROVIDER_FULL,
              amount: 30, // wrong - captured is 50
              currency: 'EUR',
            },
            'client-1',
            [Role.CLIENT],
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('throws when refund request limit (3) is exceeded', async () => {
        prismaMock.$transaction.mockImplementation(async (cb: any) =>
          cb({
            providerOrder: {
              findUnique: jest.fn().mockResolvedValue(makeProviderBoundary()),
            },
            deliveryOrder: { findUnique: jest.fn() },
            deliveryIncident: { findUnique: jest.fn() },
            refundRequest: {
              count: jest.fn().mockResolvedValue(3), // at limit
              aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
            },
          }),
        );

        await expect(
          service.requestRefund(
            {
              providerOrderId: 'po-1',
              type: RefundTypeValues.PROVIDER_PARTIAL,
              amount: 10,
              currency: 'EUR',
            },
            'client-1',
            [Role.CLIENT],
          ),
        ).rejects.toThrow(HttpException);
      });

      it('ADMIN can request a refund without risk event emission', async () => {
        prismaMock.$transaction.mockImplementation(async (cb: any) =>
          cb({
            providerOrder: {
              findUnique: jest.fn().mockResolvedValue(makeProviderBoundary()),
            },
            deliveryOrder: { findUnique: jest.fn() },
            deliveryIncident: { findUnique: jest.fn() },
            refundRequest: {
              count: jest.fn().mockResolvedValue(0),
              aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
              create: jest.fn().mockResolvedValue({
                id: 'refund-admin',
                incidentId: null,
                providerOrderId: 'po-1',
                deliveryOrderId: null,
                type: RefundTypeValues.PROVIDER_PARTIAL,
                status: RefundStatusValues.REQUESTED,
                amount: 10,
                currency: 'EUR',
                requestedById: 'admin-1',
                reviewedById: null,
                externalRefundId: null,
                createdAt: new Date(),
                reviewedAt: null,
                completedAt: null,
              }),
            },
          }),
        );

        const refund = await service.requestRefund(
          {
            providerOrderId: 'po-1',
            type: RefundTypeValues.PROVIDER_PARTIAL,
            amount: 10,
            currency: 'EUR',
          },
          'admin-1',
          [Role.ADMIN],
        );

        expect(refund.amount).toBe(10);
        expect(riskServiceMock.recordRiskEvent).not.toHaveBeenCalled();
      });

      it('requests a refund against a delivery boundary', async () => {
        prismaMock.$transaction.mockImplementation(async (cb: any) =>
          cb({
            providerOrder: { findUnique: jest.fn() },
            deliveryOrder: {
              findUnique: jest.fn().mockResolvedValue(makeDeliveryBoundary()),
            },
            deliveryIncident: { findUnique: jest.fn() },
            refundRequest: {
              count: jest.fn().mockResolvedValue(0),
              aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
              create: jest.fn().mockResolvedValue({
                id: 'refund-delivery',
                incidentId: null,
                providerOrderId: null,
                deliveryOrderId: 'delivery-1',
                type: RefundTypeValues.DELIVERY_PARTIAL,
                status: RefundStatusValues.REQUESTED,
                amount: 3,
                currency: 'EUR',
                requestedById: 'client-1',
                reviewedById: null,
                externalRefundId: null,
                createdAt: new Date(),
                reviewedAt: null,
                completedAt: null,
              }),
            },
          }),
        );

        const refund = await service.requestRefund(
          {
            deliveryOrderId: 'delivery-1',
            type: RefundTypeValues.DELIVERY_PARTIAL,
            amount: 3,
            currency: 'EUR',
          },
          'client-1',
          [Role.CLIENT],
        );

        expect(refund.deliveryOrderId).toBe('delivery-1');
      });
    });

    describe('getRefund – access control', () => {
      it('throws NotFoundException when refund does not exist', async () => {
        (prismaMock as any).refundRequest = {
          ...prismaMock.refundRequest,
          findUnique: jest.fn().mockResolvedValue(null),
        };

        await expect(
          service.getRefund('missing', 'client-1', [Role.CLIENT]),
        ).rejects.toThrow(NotFoundException);
      });

      it('allows provider to read their own provider order refund', async () => {
        (prismaMock as any).refundRequest = {
          ...prismaMock.refundRequest,
          findUnique: jest.fn().mockResolvedValue({
            id: 'refund-1',
            requestedById: 'client-1',
            incidentId: null,
            providerOrderId: 'po-1',
            deliveryOrderId: null,
            type: RefundTypeValues.PROVIDER_PARTIAL,
            status: RefundStatusValues.REQUESTED,
            amount: 10,
            currency: 'EUR',
            reviewedById: null,
            externalRefundId: null,
            createdAt: new Date(),
            reviewedAt: null,
            completedAt: null,
            providerOrder: {
              providerId: 'provider-1',
              order: { clientId: 'client-1' },
            },
            deliveryOrder: null,
          }),
        };

        const refund = await service.getRefund('refund-1', 'provider-1', [
          Role.PROVIDER,
        ]);
        expect(refund.id).toBe('refund-1');
      });

      it('allows client to read their own client order refund', async () => {
        (prismaMock as any).refundRequest = {
          ...prismaMock.refundRequest,
          findUnique: jest.fn().mockResolvedValue({
            id: 'refund-1',
            requestedById: 'other-client',
            incidentId: null,
            providerOrderId: 'po-1',
            deliveryOrderId: null,
            type: RefundTypeValues.PROVIDER_PARTIAL,
            status: RefundStatusValues.REQUESTED,
            amount: 10,
            currency: 'EUR',
            reviewedById: null,
            externalRefundId: null,
            createdAt: new Date(),
            reviewedAt: null,
            completedAt: null,
            providerOrder: {
              providerId: 'provider-1',
              order: { clientId: 'client-1' },
            },
            deliveryOrder: null,
          }),
        };

        const refund = await service.getRefund('refund-1', 'client-1', [
          Role.CLIENT,
        ]);
        expect(refund.id).toBe('refund-1');
      });

      it('throws NotFoundException for unrelated user', async () => {
        (prismaMock as any).refundRequest = {
          ...prismaMock.refundRequest,
          findUnique: jest.fn().mockResolvedValue({
            id: 'refund-1',
            requestedById: 'other-user',
            providerOrder: {
              providerId: 'other-provider',
              order: { clientId: 'other-client' },
            },
            deliveryOrder: null,
          }),
        };

        await expect(
          service.getRefund('refund-1', 'unrelated-user', [Role.CLIENT]),
        ).rejects.toThrow(NotFoundException);
      });
    });

    describe('listProviderOrderRefunds', () => {
      it('throws NotFoundException for unauthorized access', async () => {
        prismaMock.providerOrder.findUnique.mockResolvedValue(
          makeProviderBoundary(),
        );

        await expect(
          service.listProviderOrderRefunds('po-1', 'unrelated-user', [
            Role.CLIENT,
          ]),
        ).rejects.toThrow(NotFoundException);
      });

      it('returns refunds for the provider owner', async () => {
        prismaMock.providerOrder.findUnique.mockResolvedValue(
          makeProviderBoundary(),
        );
        (prismaMock as any).refundRequest = {
          ...prismaMock.refundRequest,
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'refund-1',
              incidentId: null,
              providerOrderId: 'po-1',
              deliveryOrderId: null,
              type: RefundTypeValues.PROVIDER_PARTIAL,
              status: RefundStatusValues.REQUESTED,
              amount: 10,
              currency: 'EUR',
              requestedById: 'client-1',
              reviewedById: null,
              externalRefundId: null,
              createdAt: new Date(),
              reviewedAt: null,
              completedAt: null,
            },
          ]),
        };

        const refunds = await service.listProviderOrderRefunds(
          'po-1',
          'provider-1',
          [Role.PROVIDER],
        );
        expect(refunds).toHaveLength(1);
      });
    });

    describe('listDeliveryOrderRefunds', () => {
      it('throws NotFoundException for non-client accessing delivery refunds', async () => {
        prismaMock.deliveryOrder.findUnique.mockResolvedValue(
          makeDeliveryBoundary(),
        );

        await expect(
          service.listDeliveryOrderRefunds('delivery-1', 'other-client', [
            Role.CLIENT,
          ]),
        ).rejects.toThrow(NotFoundException);
      });

      it('returns refunds for ADMIN', async () => {
        prismaMock.deliveryOrder.findUnique.mockResolvedValue(
          makeDeliveryBoundary(),
        );
        (prismaMock as any).refundRequest = {
          ...prismaMock.refundRequest,
          findMany: jest.fn().mockResolvedValue([]),
        };

        const refunds = await service.listDeliveryOrderRefunds(
          'delivery-1',
          'admin-1',
          [Role.ADMIN],
        );
        expect(refunds).toEqual([]);
      });
    });

    describe('transitionRefundStatus (reviewRefund / rejectRefund)', () => {
      it('throws NotFoundException when refund does not exist', async () => {
        prismaMock.$transaction.mockImplementation(async (cb: any) =>
          cb({
            $executeRaw: jest.fn(),
            refundRequest: {
              findUnique: jest.fn().mockResolvedValue(null),
            },
          }),
        );

        await expect(
          service.reviewRefund('missing', 'admin-1', [Role.ADMIN]),
        ).rejects.toThrow(NotFoundException);
      });

      it('returns existing refund when already in the target status', async () => {
        const refund = {
          id: 'refund-1',
          status: RefundStatusValues.UNDER_REVIEW,
          providerOrderId: 'po-1',
          deliveryOrderId: null,
          incidentId: null,
          type: RefundTypeValues.PROVIDER_PARTIAL,
          amount: 10,
          currency: 'EUR',
          requestedById: 'client-1',
          reviewedById: null,
          externalRefundId: null,
          createdAt: new Date(),
          reviewedAt: null,
          completedAt: null,
        };
        prismaMock.$transaction.mockImplementation(async (cb: any) =>
          cb({
            $executeRaw: jest.fn(),
            refundRequest: {
              findUnique: jest.fn().mockResolvedValue(refund),
            },
          }),
        );

        const result = await service.reviewRefund('refund-1', 'admin-1', [
          Role.ADMIN,
        ]);
        expect(result.status).toBe(RefundStatusValues.UNDER_REVIEW);
      });

      it('throws ConflictException when transition is invalid', async () => {
        prismaMock.$transaction.mockImplementation(async (cb: any) =>
          cb({
            $executeRaw: jest.fn(),
            refundRequest: {
              findUnique: jest.fn().mockResolvedValue({
                id: 'refund-1',
                status: RefundStatusValues.COMPLETED, // wrong status to reject
              }),
            },
          }),
        );

        await expect(
          service.rejectRefund('refund-1', 'admin-1', [Role.ADMIN]),
        ).rejects.toThrow(ConflictException);
      });
    });

    describe('validateRefundType – delivery boundary', () => {
      it('throws BadRequestException when delivery refund uses a provider type', async () => {
        prismaMock.$transaction.mockImplementation(async (cb: any) =>
          cb({
            providerOrder: { findUnique: jest.fn() },
            deliveryOrder: {
              findUnique: jest.fn().mockResolvedValue({
                id: 'delivery-1',
                runnerId: 'runner-1',
                deliveryFee: 8.5,
                currency: 'EUR',
                paymentRef: 'pi_delivery_1',
                paymentStatus: RunnerPaymentStatus.PAID,
                order: { clientId: 'client-1' },
              }),
            },
            deliveryIncident: { findUnique: jest.fn() },
            refundRequest: {
              count: jest.fn().mockResolvedValue(0),
              aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
            },
          }),
        );

        await expect(
          service.requestRefund(
            {
              deliveryOrderId: 'delivery-1',
              type: RefundTypeValues.PROVIDER_PARTIAL, // wrong type for delivery
              amount: 3,
              currency: 'EUR',
            },
            'client-1',
            [Role.CLIENT],
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('throws BadRequestException when delivery full refund amount does not match captured', async () => {
        prismaMock.$transaction.mockImplementation(async (cb: any) =>
          cb({
            providerOrder: { findUnique: jest.fn() },
            deliveryOrder: {
              findUnique: jest.fn().mockResolvedValue({
                id: 'delivery-1',
                runnerId: 'runner-1',
                deliveryFee: 8.5,
                currency: 'EUR',
                paymentRef: 'pi_delivery_1',
                paymentStatus: RunnerPaymentStatus.PAID,
                order: { clientId: 'client-1' },
              }),
            },
            deliveryIncident: { findUnique: jest.fn() },
            refundRequest: {
              count: jest.fn().mockResolvedValue(0),
              aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
            },
          }),
        );

        await expect(
          service.requestRefund(
            {
              deliveryOrderId: 'delivery-1',
              type: RefundTypeValues.DELIVERY_FULL,
              amount: 5, // wrong - captured is 8.5
              currency: 'EUR',
            },
            'client-1',
            [Role.CLIENT],
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('throws BadRequestException when delivery partial refund amount >= captured', async () => {
        prismaMock.$transaction.mockImplementation(async (cb: any) =>
          cb({
            providerOrder: { findUnique: jest.fn() },
            deliveryOrder: {
              findUnique: jest.fn().mockResolvedValue({
                id: 'delivery-1',
                runnerId: 'runner-1',
                deliveryFee: 8.5,
                currency: 'EUR',
                paymentRef: 'pi_delivery_1',
                paymentStatus: RunnerPaymentStatus.PAID,
                order: { clientId: 'client-1' },
              }),
            },
            deliveryIncident: { findUnique: jest.fn() },
            refundRequest: {
              count: jest.fn().mockResolvedValue(0),
              aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
            },
          }),
        );

        await expect(
          service.requestRefund(
            {
              deliveryOrderId: 'delivery-1',
              type: RefundTypeValues.DELIVERY_PARTIAL,
              amount: 9, // >= captured (8.5)
              currency: 'EUR',
            },
            'client-1',
            [Role.CLIENT],
          ),
        ).rejects.toThrow(BadRequestException);
      });
    });

    describe('ensureIncidentMatchesBoundary', () => {
      it('throws NotFoundException when incidentId is provided but incident does not exist', async () => {
        prismaMock.$transaction.mockImplementation(async (cb: any) =>
          cb({
            providerOrder: {
              findUnique: jest.fn().mockResolvedValue({
                id: 'po-1',
                providerId: 'provider-1',
                subtotalAmount: 50,
                paymentRef: 'pi_provider_1',
                paymentStatus: ProviderPaymentStatus.PAID,
                order: {
                  id: 'order-1',
                  clientId: 'client-1',
                  deliveryOrder: { id: 'delivery-1' },
                },
              }),
            },
            deliveryOrder: { findUnique: jest.fn() },
            deliveryIncident: {
              findUnique: jest.fn().mockResolvedValue(null), // incident not found
            },
            refundRequest: {
              count: jest.fn().mockResolvedValue(0),
              aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
            },
          }),
        );

        await expect(
          service.requestRefund(
            {
              providerOrderId: 'po-1',
              incidentId: 'incident-missing',
              type: RefundTypeValues.PROVIDER_PARTIAL,
              amount: 10,
              currency: 'EUR',
            },
            'client-1',
            [Role.CLIENT],
          ),
        ).rejects.toThrow(NotFoundException);
      });

      it('throws BadRequestException when incident does not belong to delivery boundary', async () => {
        prismaMock.$transaction.mockImplementation(async (cb: any) =>
          cb({
            providerOrder: { findUnique: jest.fn() },
            deliveryOrder: {
              findUnique: jest.fn().mockResolvedValue({
                id: 'delivery-1',
                runnerId: 'runner-1',
                deliveryFee: 8.5,
                currency: 'EUR',
                paymentRef: 'pi_delivery_1',
                paymentStatus: RunnerPaymentStatus.PAID,
                order: { clientId: 'client-1' },
              }),
            },
            deliveryIncident: {
              findUnique: jest.fn().mockResolvedValue({
                id: 'incident-1',
                deliveryOrderId: 'other-delivery', // mismatch
              }),
            },
            refundRequest: {
              count: jest.fn().mockResolvedValue(0),
              aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
            },
          }),
        );

        await expect(
          service.requestRefund(
            {
              deliveryOrderId: 'delivery-1',
              incidentId: 'incident-1',
              type: RefundTypeValues.DELIVERY_PARTIAL,
              amount: 3,
              currency: 'EUR',
            },
            'client-1',
            [Role.CLIENT],
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('throws BadRequestException when incident does not belong to provider order', async () => {
        prismaMock.$transaction.mockImplementation(async (cb: any) =>
          cb({
            providerOrder: {
              findUnique: jest.fn().mockResolvedValue({
                id: 'po-1',
                providerId: 'provider-1',
                subtotalAmount: 50,
                paymentRef: 'pi_provider_1',
                paymentStatus: ProviderPaymentStatus.PAID,
                order: {
                  id: 'order-1',
                  clientId: 'client-1',
                  deliveryOrder: { id: 'delivery-1' },
                },
              }),
            },
            deliveryOrder: { findUnique: jest.fn() },
            deliveryIncident: {
              findUnique: jest.fn().mockResolvedValue({
                id: 'incident-1',
                deliveryOrderId: 'other-delivery', // mismatch with incidentDeliveryOrderId (delivery-1)
              }),
            },
            refundRequest: {
              count: jest.fn().mockResolvedValue(0),
              aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
            },
          }),
        );

        await expect(
          service.requestRefund(
            {
              providerOrderId: 'po-1',
              incidentId: 'incident-1',
              type: RefundTypeValues.PROVIDER_PARTIAL,
              amount: 10,
              currency: 'EUR',
            },
            'client-1',
            [Role.CLIENT],
          ),
        ).rejects.toThrow(BadRequestException);
      });
    });

    describe('getRefund – client delivery order access', () => {
      it('allows client to read refund linked to their delivery order', async () => {
        (prismaMock as any).refundRequest = {
          ...prismaMock.refundRequest,
          findUnique: jest.fn().mockResolvedValue({
            id: 'refund-del',
            requestedById: 'other-user',
            incidentId: null,
            providerOrderId: null,
            deliveryOrderId: 'delivery-1',
            type: RefundTypeValues.DELIVERY_PARTIAL,
            status: RefundStatusValues.REQUESTED,
            amount: 3,
            currency: 'EUR',
            reviewedById: null,
            externalRefundId: null,
            createdAt: new Date(),
            reviewedAt: null,
            completedAt: null,
            providerOrder: null,
            deliveryOrder: {
              order: { clientId: 'client-1' },
            },
          }),
        };

        const refund = await service.getRefund('refund-del', 'client-1', [
          Role.CLIENT,
        ]);
        expect(refund.id).toBe('refund-del');
      });
    });

    describe('transitionRefundStatus – delivery boundary log', () => {
      it('transitions delivery boundary refund and logs DELIVERY_ORDER type', async () => {
        const updated = {
          id: 'refund-del',
          status: RefundStatusValues.UNDER_REVIEW,
          providerOrderId: null,
          deliveryOrderId: 'delivery-1',
          incidentId: null,
          type: RefundTypeValues.DELIVERY_PARTIAL,
          amount: 3,
          currency: 'EUR',
          requestedById: 'client-1',
          reviewedById: 'admin-1',
          externalRefundId: null,
          createdAt: new Date(),
          reviewedAt: new Date(),
          completedAt: null,
        };
        prismaMock.$transaction.mockImplementation(async (cb: any) =>
          cb({
            $executeRaw: jest.fn(),
            refundRequest: {
              findUnique: jest.fn().mockResolvedValue({
                ...updated,
                status: RefundStatusValues.REQUESTED,
                reviewedAt: null,
              }),
              update: jest.fn().mockResolvedValue(updated),
            },
          }),
        );

        const result = await service.reviewRefund('refund-del', 'admin-1', [
          Role.ADMIN,
        ]);
        expect(result.status).toBe(RefundStatusValues.UNDER_REVIEW);
      });
    });

    describe('listProviderOrderRefunds – ADMIN and CLIENT access', () => {
      it('returns refunds for ADMIN', async () => {
        prismaMock.providerOrder.findUnique.mockResolvedValue(
          makeProviderBoundary(),
        );
        (prismaMock as any).refundRequest = {
          ...prismaMock.refundRequest,
          findMany: jest.fn().mockResolvedValue([]),
        };

        const refunds = await service.listProviderOrderRefunds(
          'po-1',
          'admin-1',
          [Role.ADMIN],
        );
        expect(refunds).toEqual([]);
      });

      it('returns refunds for the client owner', async () => {
        prismaMock.providerOrder.findUnique.mockResolvedValue(
          makeProviderBoundary(),
        );
        (prismaMock as any).refundRequest = {
          ...prismaMock.refundRequest,
          findMany: jest.fn().mockResolvedValue([]),
        };

        const refunds = await service.listProviderOrderRefunds(
          'po-1',
          'client-1',
          [Role.CLIENT],
        );
        expect(refunds).toEqual([]);
      });
    });

    describe('executeRefund – edge cases', () => {
      it('throws NotFoundException when refund does not exist', async () => {
        prismaMock.$transaction.mockImplementation(async (cb: any) =>
          cb({
            $executeRaw: jest.fn(),
            refundRequest: {
              findUnique: jest.fn().mockResolvedValue(null),
            },
          }),
        );

        await expect(
          service.executeRefund('missing', 'admin-1', [Role.ADMIN]),
        ).rejects.toThrow(NotFoundException);
      });

      it('throws ConflictException when refund is not approved', async () => {
        prismaMock.$transaction.mockImplementation(async (cb: any) =>
          cb({
            $executeRaw: jest.fn(),
            refundRequest: {
              findUnique: jest.fn().mockResolvedValue({
                id: 'refund-1',
                status: RefundStatusValues.REQUESTED, // not approved
                providerOrderId: 'po-1',
                deliveryOrderId: null,
              }),
            },
          }),
        );

        await expect(
          service.executeRefund('refund-1', 'admin-1', [Role.ADMIN]),
        ).rejects.toThrow(ConflictException);
      });

      it('throws ConflictException when boundary has no payment reference', async () => {
        prismaMock.paymentAccount.findFirst.mockResolvedValue({
          externalAccountId: 'acct_1',
          isActive: true,
        });
        prismaMock.$transaction.mockImplementation(async (cb: any) =>
          cb({
            $executeRaw: jest.fn(),
            refundRequest: {
              findUnique: jest.fn().mockResolvedValue({
                id: 'refund-1',
                status: RefundStatusValues.APPROVED,
                providerOrderId: 'po-1',
                deliveryOrderId: null,
                amount: 10,
                reviewedById: 'admin-1',
                reviewedAt: new Date(),
              }),
              update: jest.fn(),
              aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
            },
            providerOrder: {
              findUnique: jest.fn().mockResolvedValue(
                makeProviderBoundary({ paymentRef: null }), // no payment ref
              ),
            },
            deliveryOrder: { findUnique: jest.fn() },
          }),
        );

        await expect(
          service.executeRefund('refund-1', 'admin-1', [Role.ADMIN]),
        ).rejects.toThrow(ConflictException);
      });

      it('throws ConflictException when no stripe account is found for boundary', async () => {
        prismaMock.paymentAccount.findFirst.mockResolvedValue(null);
        prismaMock.user.findUnique.mockResolvedValue({ stripeAccountId: null }); // no stripe
        prismaMock.$transaction.mockImplementation(async (cb: any) =>
          cb({
            $executeRaw: jest.fn(),
            refundRequest: {
              findUnique: jest.fn().mockResolvedValue({
                id: 'refund-1',
                status: RefundStatusValues.APPROVED,
                providerOrderId: 'po-1',
                deliveryOrderId: null,
                amount: 10,
                reviewedById: 'admin-1',
                reviewedAt: new Date(),
              }),
              update: jest.fn(),
              aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
            },
            providerOrder: {
              findUnique: jest.fn().mockResolvedValue(makeProviderBoundary()),
            },
            deliveryOrder: { findUnique: jest.fn() },
          }),
        );

        await expect(
          service.executeRefund('refund-1', 'admin-1', [Role.ADMIN]),
        ).rejects.toThrow(ConflictException);
      });

      it('throws ConflictException when delivery boundary has no runner assigned', async () => {
        prismaMock.$transaction.mockImplementation(async (cb: any) =>
          cb({
            $executeRaw: jest.fn(),
            refundRequest: {
              findUnique: jest.fn().mockResolvedValue({
                id: 'refund-1',
                status: RefundStatusValues.APPROVED,
                providerOrderId: null,
                deliveryOrderId: 'delivery-1',
                amount: 4,
                reviewedById: 'admin-1',
                reviewedAt: new Date(),
              }),
              update: jest.fn(),
              aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
            },
            providerOrder: { findUnique: jest.fn() },
            deliveryOrder: {
              findUnique: jest.fn().mockResolvedValue({
                id: 'delivery-1',
                runnerId: null, // no runner
                deliveryFee: 8.5,
                currency: 'EUR',
                paymentRef: 'pi_delivery_1',
                paymentStatus: RunnerPaymentStatus.PAID,
                order: { clientId: 'client-1' },
              }),
            },
          }),
        );

        await expect(
          service.executeRefund('refund-1', 'admin-1', [Role.ADMIN]),
        ).rejects.toThrow(ConflictException);
      });

      it('uses stripe account from user.stripeAccountId upsert when paymentAccount not found', async () => {
        prismaMock.paymentAccount.findFirst.mockResolvedValue(null);
        prismaMock.user.findUnique.mockResolvedValue({
          stripeAccountId: 'acct_from_user',
        });
        prismaMock.paymentAccount.upsert = jest.fn().mockResolvedValue({
          externalAccountId: 'acct_from_user',
          isActive: true,
        });

        const txRefundUpdate = jest
          .fn()
          .mockImplementation(({ data }: any) => ({ id: 'refund-1', ...data }));

        prismaMock.$transaction
          .mockImplementationOnce(async (cb: any) =>
            cb({
              $executeRaw: jest.fn(),
              refundRequest: {
                findUnique: jest.fn().mockResolvedValue({
                  id: 'refund-1',
                  status: RefundStatusValues.APPROVED,
                  providerOrderId: 'po-1',
                  deliveryOrderId: null,
                  amount: 10,
                  reviewedById: 'admin-1',
                  reviewedAt: new Date(),
                }),
                update: txRefundUpdate,
                aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
              },
              providerOrder: {
                findUnique: jest.fn().mockResolvedValue(makeProviderBoundary()),
              },
              deliveryOrder: { findUnique: jest.fn() },
            }),
          )
          .mockImplementationOnce(async (cb: any) =>
            cb({
              $executeRaw: jest.fn(),
              refundRequest: {
                findUnique: jest.fn().mockResolvedValue({
                  id: 'refund-1',
                  status: RefundStatusValues.EXECUTING,
                  providerOrderId: 'po-1',
                  deliveryOrderId: null,
                  amount: 10,
                  reviewedById: 'admin-1',
                  reviewedAt: new Date(),
                }),
                update: txRefundUpdate,
              },
            }),
          );

        const refund = await service.executeRefund('refund-1', 'admin-1', [
          Role.ADMIN,
        ]);
        expect(refund.status).toBe(RefundStatusValues.COMPLETED);
        expect(prismaMock.paymentAccount.upsert).toHaveBeenCalled();
      });

      it('marks refund as FAILED when Stripe throws', async () => {
        prismaMock.paymentAccount.findFirst.mockResolvedValue({
          externalAccountId: 'acct_provider_1',
          isActive: true,
        });

        prismaMock.$transaction.mockImplementationOnce(async (cb: any) =>
          cb({
            $executeRaw: jest.fn(),
            refundRequest: {
              findUnique: jest.fn().mockResolvedValue({
                id: 'refund-1',
                status: RefundStatusValues.APPROVED,
                providerOrderId: 'po-1',
                deliveryOrderId: null,
                amount: 10,
                reviewedById: 'admin-1',
                reviewedAt: new Date(),
              }),
              update: jest.fn().mockResolvedValue({
                id: 'refund-1',
                status: RefundStatusValues.EXECUTING,
                amount: 10,
              }),
              aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
            },
            providerOrder: {
              findUnique: jest.fn().mockResolvedValue(makeProviderBoundary()),
            },
            deliveryOrder: { findUnique: jest.fn() },
          }),
        );

        stripeRefundsCreate.mockRejectedValue(new Error('Stripe error'));
        prismaMock.refundRequest.update = jest.fn().mockResolvedValue({});

        await expect(
          service.executeRefund('refund-1', 'admin-1', [Role.ADMIN]),
        ).rejects.toThrow('Stripe error');

        expect(prismaMock.refundRequest.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: { status: RefundStatusValues.FAILED },
          }),
        );
      });
    });
  });
});
