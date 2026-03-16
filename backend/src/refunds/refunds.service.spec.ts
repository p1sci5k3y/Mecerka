import {
  ConflictException,
  ForbiddenException,
  BadRequestException,
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
});
