import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ProviderPaymentStatus,
  Role,
  RunnerPaymentStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RiskService } from '../risk/risk.service';
import { RefundStatusValues, RefundTypeValues } from './refund.constants';
import { RefundBoundaryService } from './refund-boundary.service';
import { RefundRequestQueryService } from './refund-request-query.service';

describe('RefundRequestQueryService', () => {
  let service: RefundRequestQueryService;
  let prismaMock: {
    refundRequest: {
      count: jest.Mock;
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      aggregate: jest.Mock;
    };
    providerOrder: { findUnique: jest.Mock };
    deliveryOrder: { findUnique: jest.Mock };
    deliveryIncident: { findUnique: jest.Mock };
    paymentAccount: { findFirst: jest.Mock; upsert: jest.Mock };
    user: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let riskServiceMock: {
    recordRiskEvent: jest.Mock;
    recalculateRiskScore: jest.Mock;
  };

  beforeEach(async () => {
    prismaMock = {
      refundRequest: {
        count: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        aggregate: jest.fn(),
      },
      providerOrder: { findUnique: jest.fn() },
      deliveryOrder: { findUnique: jest.fn() },
      deliveryIncident: { findUnique: jest.fn() },
      paymentAccount: { findFirst: jest.fn(), upsert: jest.fn() },
      user: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };

    riskServiceMock = {
      recordRiskEvent: jest.fn().mockResolvedValue({ created: true }),
      recalculateRiskScore: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefundRequestQueryService,
        RefundBoundaryService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: RiskService, useValue: riskServiceMock },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get<RefundRequestQueryService>(RefundRequestQueryService);
  });

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

  const makeRefund = (overrides = {}) => ({
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
    createdAt: new Date(),
    reviewedAt: null,
    completedAt: null,
    ...overrides,
  });

  it('requests a provider refund and emits client refund abuse risk', async () => {
    prismaMock.$transaction.mockImplementation(
      async (cb: (tx: Record<string, unknown>) => unknown) =>
        cb({
          providerOrder: {
            findUnique: jest.fn().mockResolvedValue(makeProviderBoundary()),
          },
          deliveryOrder: { findUnique: jest.fn() },
          deliveryIncident: { findUnique: jest.fn() },
          refundRequest: {
            count: jest.fn().mockResolvedValue(0),
            aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
            create: jest.fn().mockResolvedValue(makeRefund()),
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
    expect(riskServiceMock.recordRiskEvent).toHaveBeenCalled();
  });

  it('does not fail the refund request when risk integration is unavailable', async () => {
    riskServiceMock.recordRiskEvent.mockRejectedValue(new Error('risk down'));
    prismaMock.$transaction.mockImplementation(
      async (cb: (tx: Record<string, unknown>) => unknown) =>
        cb({
          providerOrder: {
            findUnique: jest.fn().mockResolvedValue(makeProviderBoundary()),
          },
          deliveryOrder: { findUnique: jest.fn() },
          deliveryIncident: { findUnique: jest.fn() },
          refundRequest: {
            count: jest.fn().mockResolvedValue(0),
            aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
            create: jest
              .fn()
              .mockResolvedValue(makeRefund({ id: 'refund-risk' })),
          },
        }),
    );

    await expect(
      service.requestRefund(
        {
          providerOrderId: 'po-1',
          type: RefundTypeValues.PROVIDER_PARTIAL,
          amount: 15,
          currency: 'EUR',
        },
        'client-1',
        [Role.CLIENT],
      ),
    ).resolves.toMatchObject({ id: 'refund-risk', amount: 15 });

    expect(riskServiceMock.recalculateRiskScore).not.toHaveBeenCalled();
  });

  it('requests a refund even when the optional RiskService is not wired', async () => {
    const boundaryService = new RefundBoundaryService(prismaMock as never);
    const serviceWithoutRisk = new RefundRequestQueryService(
      prismaMock as never,
      boundaryService,
    );

    prismaMock.$transaction.mockImplementation(
      async (cb: (tx: Record<string, unknown>) => unknown) =>
        cb({
          providerOrder: {
            findUnique: jest.fn().mockResolvedValue(makeProviderBoundary()),
          },
          deliveryOrder: { findUnique: jest.fn() },
          deliveryIncident: { findUnique: jest.fn() },
          refundRequest: {
            count: jest.fn().mockResolvedValue(0),
            aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
            create: jest
              .fn()
              .mockResolvedValue(makeRefund({ id: 'refund-no-risk' })),
          },
        }),
    );

    await expect(
      serviceWithoutRisk.requestRefund(
        {
          providerOrderId: 'po-1',
          type: RefundTypeValues.PROVIDER_PARTIAL,
          amount: 15,
          currency: 'EUR',
        },
        'client-1',
        [Role.CLIENT],
      ),
    ).resolves.toMatchObject({ id: 'refund-no-risk', amount: 15 });
  });

  it('returns a sanitized refund for the requesting client', async () => {
    prismaMock.refundRequest.findUnique.mockResolvedValue(
      makeRefund({
        amount: 10,
        providerOrder: {
          providerId: 'provider-1',
          order: { clientId: 'client-1' },
        },
        deliveryOrder: null,
      }),
    );

    const refund = await service.getRefund('refund-1', 'client-1', [
      Role.CLIENT,
    ]);

    expect(refund).toMatchObject({
      id: 'refund-1',
      amount: 10,
      providerOrderId: 'po-1',
    });
  });

  it('throws NotFoundException when the refund does not exist', async () => {
    prismaMock.refundRequest.findUnique.mockResolvedValue(null);

    await expect(
      service.getRefund('missing', 'client-1', [Role.CLIENT]),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when an unrelated user tries to read a refund', async () => {
    prismaMock.refundRequest.findUnique.mockResolvedValue(
      makeRefund({
        requestedById: 'other-user',
        providerOrder: {
          providerId: 'provider-1',
          order: { clientId: 'other-client' },
        },
        deliveryOrder: null,
      }),
    );

    await expect(
      service.getRefund('refund-1', 'client-1', [Role.CLIENT]),
    ).rejects.toThrow(NotFoundException);
  });

  it('lists sanitized provider refunds for an owning client', async () => {
    prismaMock.providerOrder.findUnique.mockResolvedValue(
      makeProviderBoundary(),
    );
    prismaMock.refundRequest.findMany.mockResolvedValue([
      makeRefund({ amount: 10 }),
    ]);

    const refunds = await service.listProviderOrderRefunds('po-1', 'client-1', [
      Role.CLIENT,
    ]);

    expect(refunds).toHaveLength(1);
    expect(refunds[0]?.amount).toBe(10);
  });

  it('allows the provider owner to list provider refunds', async () => {
    prismaMock.providerOrder.findUnique.mockResolvedValue(
      makeProviderBoundary(),
    );
    prismaMock.refundRequest.findMany.mockResolvedValue([
      makeRefund({ requestedById: 'client-1' }),
    ]);

    const refunds = await service.listProviderOrderRefunds(
      'po-1',
      'provider-1',
      [Role.PROVIDER],
    );

    expect(refunds).toHaveLength(1);
  });

  it('throws NotFoundException when another client tries to list provider refunds', async () => {
    prismaMock.providerOrder.findUnique.mockResolvedValue(
      makeProviderBoundary(),
    );

    await expect(
      service.listProviderOrderRefunds('po-1', 'other-client', [Role.CLIENT]),
    ).rejects.toThrow(NotFoundException);
  });

  it('lists delivery refunds for the owning client', async () => {
    prismaMock.deliveryOrder.findUnique.mockResolvedValue(
      makeDeliveryBoundary(),
    );
    prismaMock.refundRequest.findMany.mockResolvedValue([
      makeRefund({
        providerOrderId: null,
        deliveryOrderId: 'delivery-1',
        type: RefundTypeValues.DELIVERY_PARTIAL,
        amount: 3,
      }),
    ]);

    const refunds = await service.listDeliveryOrderRefunds(
      'delivery-1',
      'client-1',
      [Role.CLIENT],
    );

    expect(refunds).toHaveLength(1);
    expect(refunds[0]?.deliveryOrderId).toBe('delivery-1');
  });

  it('throws NotFoundException when a third party tries to list delivery refunds', async () => {
    prismaMock.deliveryOrder.findUnique.mockResolvedValue(
      makeDeliveryBoundary(),
    );

    await expect(
      service.listDeliveryOrderRefunds('delivery-1', 'other-client', [
        Role.CLIENT,
      ]),
    ).rejects.toThrow(NotFoundException);
  });
});
