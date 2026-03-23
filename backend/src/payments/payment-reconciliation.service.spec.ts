import { PaymentReconciliationService } from './payment-reconciliation.service';

describe('PaymentReconciliationService', () => {
  let service: PaymentReconciliationService;
  let prismaMock: {
    providerOrder: { findMany: jest.Mock };
    providerPaymentSession: { findMany: jest.Mock };
    paymentWebhookEvent: { findMany: jest.Mock };
  };

  beforeEach(() => {
    prismaMock = {
      providerOrder: {
        findMany: jest.fn(),
      },
      providerPaymentSession: {
        findMany: jest.fn(),
      },
      paymentWebhookEvent: {
        findMany: jest.fn(),
      },
    };

    service = new PaymentReconciliationService(prismaMock as never);
  });

  it('returns the existing reconciliation buckets and flags provider orders with multiple open sessions', async () => {
    prismaMock.providerOrder.findMany
      .mockResolvedValueOnce([{ id: 'po-paid', orderId: 'order-1' }])
      .mockResolvedValueOnce([{ id: 'po-expired', orderId: 'order-2' }]);
    prismaMock.paymentWebhookEvent.findMany.mockResolvedValue([
      {
        id: 'evt-1',
        eventType: 'payment_intent.succeeded',
        receivedAt: new Date('2026-03-23T10:54:00.000Z'),
      },
    ]);
    prismaMock.providerPaymentSession.findMany.mockResolvedValue([
      { providerOrderId: 'po-1' },
      { providerOrderId: 'po-1' },
      { providerOrderId: 'po-2' },
    ]);

    const result = await service.findPaymentReconciliationIssues(
      new Date('2026-03-23T11:00:00.000Z'),
    );

    expect(result).toEqual({
      paidProviderOrdersPendingRootOrders: [
        { id: 'po-paid', orderId: 'order-1' },
      ],
      activeSessionsWithExpiredReservations: [
        { id: 'po-expired', orderId: 'order-2' },
      ],
      staleReceivedWebhookEvents: [
        {
          id: 'evt-1',
          eventType: 'payment_intent.succeeded',
          receivedAt: new Date('2026-03-23T10:54:00.000Z'),
        },
      ],
      multipleOpenSessions: [
        {
          providerOrderId: 'po-1',
          openSessionCount: 2,
        },
      ],
    });
  });

  it('uses a five-minute stale window for received webhook events', async () => {
    prismaMock.providerOrder.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prismaMock.paymentWebhookEvent.findMany.mockResolvedValue([]);
    prismaMock.providerPaymentSession.findMany.mockResolvedValue([]);

    await service.findPaymentReconciliationIssues(
      new Date('2026-03-23T11:00:00.000Z'),
    );

    expect(prismaMock.paymentWebhookEvent.findMany).toHaveBeenCalledWith({
      where: {
        status: 'RECEIVED',
        receivedAt: { lt: new Date('2026-03-23T10:55:00.000Z') },
      },
      select: {
        id: true,
        eventType: true,
        receivedAt: true,
      },
    });
  });
});
