import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ProviderPaymentStatus, Role } from '@prisma/client';
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

  it('requests a provider refund and emits client refund abuse risk', async () => {
    prismaMock.$transaction.mockImplementation(
      async (cb: (tx: Record<string, unknown>) => unknown) =>
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
          deliveryIncident: { findUnique: jest.fn() },
          refundRequest: {
            count: jest.fn().mockResolvedValue(0),
            aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
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
        amount: 15,
        currency: 'EUR',
      },
      'client-1',
      [Role.CLIENT],
    );

    expect(refund.amount).toBe(15);
    expect(riskServiceMock.recordRiskEvent).toHaveBeenCalled();
  });

  it('lists sanitized provider refunds for an owning client', async () => {
    prismaMock.providerOrder.findUnique.mockResolvedValue({
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
    prismaMock.refundRequest.findMany.mockResolvedValue([
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
    ]);

    const refunds = await service.listProviderOrderRefunds('po-1', 'client-1', [
      Role.CLIENT,
    ]);

    expect(refunds).toHaveLength(1);
    expect(refunds[0]?.amount).toBe(10);
  });
});
