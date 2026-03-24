import { Role } from '@prisma/client';
import { DemoCleanupService } from './demo-cleanup.service';

describe('DemoCleanupService', () => {
  let service: DemoCleanupService;
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      user: { findMany: jest.fn() },
      order: { findMany: jest.fn() },
      providerOrder: { findMany: jest.fn() },
      deliveryOrder: { findMany: jest.fn() },
      deliveryJob: { findMany: jest.fn() },
      product: { findMany: jest.fn() },
      $transaction: jest.fn(),
    };

    service = new DemoCleanupService(prismaMock);
  });

  it('skips optional cleanup branches when there is no demo data', async () => {
    const txMock = {
      deliveryJobClaim: { deleteMany: jest.fn() },
      deliveryIncident: { deleteMany: jest.fn() },
      runnerPaymentSession: { deleteMany: jest.fn() },
      refundRequest: { deleteMany: jest.fn() },
      deliveryJob: { deleteMany: jest.fn() },
      runnerLocation: { deleteMany: jest.fn() },
      deliveryOrder: { deleteMany: jest.fn() },
      providerPaymentSession: { deleteMany: jest.fn() },
      stockReservation: { deleteMany: jest.fn() },
      orderItem: { deleteMany: jest.fn() },
      providerOrder: { deleteMany: jest.fn() },
      orderSummaryDocument: { deleteMany: jest.fn() },
      order: { deleteMany: jest.fn() },
      cartItem: { deleteMany: jest.fn() },
      cartProvider: { deleteMany: jest.fn() },
      cartGroup: { deleteMany: jest.fn() },
      productImportJob: { deleteMany: jest.fn() },
      product: { deleteMany: jest.fn() },
      paymentAccount: { deleteMany: jest.fn() },
      runnerProfile: { deleteMany: jest.fn() },
      riskEvent: { deleteMany: jest.fn() },
      riskScoreSnapshot: { deleteMany: jest.fn() },
      user: { deleteMany: jest.fn() },
      paymentWebhookEvent: { deleteMany: jest.fn() },
      runnerWebhookEvent: { deleteMany: jest.fn() },
    };
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.order.findMany.mockResolvedValue([]);
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(txMock));

    const result = await service.cleanupDemoData('admin-1', '.demo.test');

    expect(prismaMock.providerOrder.findMany).not.toHaveBeenCalled();
    expect(prismaMock.deliveryOrder.findMany).not.toHaveBeenCalled();
    expect(prismaMock.deliveryJob.findMany).not.toHaveBeenCalled();
    expect(prismaMock.product.findMany).not.toHaveBeenCalled();
    expect(txMock.deliveryJobClaim.deleteMany).not.toHaveBeenCalled();
    expect(txMock.user.deleteMany).not.toHaveBeenCalled();
    expect(txMock.paymentWebhookEvent.deleteMany).toHaveBeenCalled();
    expect(txMock.runnerWebhookEvent.deleteMany).toHaveBeenCalled();
    expect(result).toEqual({
      status: 'ok',
      usersDeleted: 0,
      productsDeleted: 0,
      ordersDeleted: 0,
    });
  });

  it('cleans all dependent demo records when demo users, orders and products exist', async () => {
    const txMock = {
      deliveryJobClaim: { deleteMany: jest.fn() },
      deliveryIncident: { deleteMany: jest.fn() },
      runnerPaymentSession: { deleteMany: jest.fn() },
      refundRequest: { deleteMany: jest.fn() },
      deliveryJob: { deleteMany: jest.fn() },
      runnerLocation: { deleteMany: jest.fn() },
      deliveryOrder: { deleteMany: jest.fn() },
      providerPaymentSession: { deleteMany: jest.fn() },
      stockReservation: { deleteMany: jest.fn() },
      orderItem: { deleteMany: jest.fn() },
      providerOrder: { deleteMany: jest.fn() },
      orderSummaryDocument: { deleteMany: jest.fn() },
      order: { deleteMany: jest.fn() },
      cartItem: { deleteMany: jest.fn() },
      cartProvider: { deleteMany: jest.fn() },
      cartGroup: { deleteMany: jest.fn() },
      productImportJob: { deleteMany: jest.fn() },
      product: { deleteMany: jest.fn() },
      paymentAccount: { deleteMany: jest.fn() },
      runnerProfile: { deleteMany: jest.fn() },
      riskEvent: { deleteMany: jest.fn() },
      riskScoreSnapshot: { deleteMany: jest.fn() },
      user: { deleteMany: jest.fn() },
      paymentWebhookEvent: { deleteMany: jest.fn() },
      runnerWebhookEvent: { deleteMany: jest.fn() },
    };
    prismaMock.user.findMany.mockResolvedValue([
      { id: 'provider-1', email: 'p@demo.test', roles: [Role.PROVIDER] },
      { id: 'runner-1', email: 'r@demo.test', roles: [Role.RUNNER] },
      { id: 'client-1', email: 'c@demo.test', roles: [Role.CLIENT] },
    ]);
    prismaMock.order.findMany.mockResolvedValue([{ id: 'order-1' }]);
    prismaMock.providerOrder.findMany.mockResolvedValue([{ id: 'po-1' }]);
    prismaMock.deliveryOrder.findMany.mockResolvedValue([{ id: 'do-1' }]);
    prismaMock.deliveryJob.findMany.mockResolvedValue([{ id: 'job-1' }]);
    prismaMock.product.findMany.mockResolvedValue([{ id: 'prod-1' }]);
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(txMock));

    const result = await service.cleanupDemoData('admin-1', '.demo.test');

    expect(txMock.deliveryJobClaim.deleteMany).toHaveBeenCalled();
    expect(txMock.deliveryIncident.deleteMany).toHaveBeenCalled();
    expect(txMock.runnerPaymentSession.deleteMany).toHaveBeenCalled();
    expect(txMock.providerPaymentSession.deleteMany).toHaveBeenCalled();
    expect(txMock.orderSummaryDocument.deleteMany).toHaveBeenCalled();
    expect(txMock.cartItem.deleteMany).toHaveBeenCalled();
    expect(txMock.productImportJob.deleteMany).toHaveBeenCalled();
    expect(txMock.paymentAccount.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerId: { in: ['provider-1', 'runner-1'] } },
      }),
    );
    expect(txMock.riskEvent.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          actorId: {
            in: ['provider-1', 'runner-1', 'client-1', 'order-1', 'do-1'],
          },
        },
      }),
    );
    expect(txMock.user.deleteMany).toHaveBeenCalled();
    expect(result).toEqual({
      status: 'ok',
      usersDeleted: 3,
      productsDeleted: 1,
      ordersDeleted: 1,
    });
  });
});
