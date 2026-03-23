import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  DeliveryStatus,
  PaymentSessionStatus,
  ProviderPaymentStatus,
} from '@prisma/client';
import { ProviderPaymentSettlementService } from './provider-payment-settlement.service';

describe('ProviderPaymentSettlementService', () => {
  let service: ProviderPaymentSettlementService;
  let txMock: any;

  beforeEach(() => {
    service = new ProviderPaymentSettlementService();
    txMock = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      stockReservation: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      product: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      providerPaymentSession: {
        update: jest.fn().mockResolvedValue({}),
      },
      providerOrder: {
        update: jest.fn().mockResolvedValue({}),
      },
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-1',
          status: DeliveryStatus.PENDING,
          providerOrders: [
            { id: 'po-1', paymentStatus: ProviderPaymentStatus.PAID },
          ],
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
  });

  it('settles a confirmed payment and confirms the root order when all provider orders are paid', async () => {
    const result = await service.settleConfirmedProviderPayment(
      txMock,
      { id: 'ps-1' },
      {
        id: 'po-1',
        subtotalAmount: 10,
        order: { id: 'order-1', status: DeliveryStatus.PENDING },
        reservations: [
          {
            id: 'res-1',
            productId: 'prod-1',
            quantity: 1,
          },
        ],
      },
      'cs_123',
      new Date('2026-01-01T00:00:00.000Z'),
    );

    expect(txMock.providerPaymentSession.update).toHaveBeenCalledWith({
      where: { id: 'ps-1' },
      data: { status: PaymentSessionStatus.COMPLETED },
    });
    expect(result).toMatchObject({
      success: true,
      orderId: 'order-1',
      providerOrderId: 'po-1',
      paymentRef: 'cs_123',
    });
  });

  it('fails when reservations changed during settlement', async () => {
    txMock.stockReservation.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.settleConfirmedProviderPayment(
        txMock,
        { id: 'ps-1' },
        {
          id: 'po-1',
          subtotalAmount: 10,
          order: { id: 'order-1', status: DeliveryStatus.PENDING },
          reservations: [
            {
              id: 'res-1',
              productId: 'prod-1',
              quantity: 1,
            },
          ],
        },
        'cs_123',
        new Date(),
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('fails when stock cannot be decremented atomically', async () => {
    txMock.product.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.settleConfirmedProviderPayment(
        txMock,
        { id: 'ps-1' },
        {
          id: 'po-1',
          subtotalAmount: 10,
          order: { id: 'order-1', status: DeliveryStatus.PENDING },
          reservations: [
            {
              id: 'res-1',
              productId: 'prod-1',
              quantity: 1,
            },
          ],
        },
        'cs_123',
        new Date(),
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('fails when the refreshed order disappears during settlement', async () => {
    txMock.order.findUnique.mockResolvedValue(null);

    await expect(
      service.settleConfirmedProviderPayment(
        txMock,
        { id: 'ps-1' },
        {
          id: 'po-1',
          subtotalAmount: 10,
          order: { id: 'order-1', status: DeliveryStatus.PENDING },
          reservations: [
            {
              id: 'res-1',
              productId: 'prod-1',
              quantity: 1,
            },
          ],
        },
        'cs_123',
        new Date(),
      ),
    ).rejects.toThrow(NotFoundException);
  });
});
