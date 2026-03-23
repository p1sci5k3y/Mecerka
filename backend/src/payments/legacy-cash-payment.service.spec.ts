import * as argon2 from 'argon2';
import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DeliveryStatus } from '@prisma/client';
import { LegacyCashPaymentService } from './legacy-cash-payment.service';

jest.mock('argon2', () => ({
  verify: jest.fn(),
}));

describe('LegacyCashPaymentService', () => {
  let service: LegacyCashPaymentService;
  let prismaMock: {
    user: { findUnique: jest.Mock };
    order: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let configServiceMock: { get: jest.Mock };
  let eventEmitterMock: { emit: jest.Mock };

  beforeEach(() => {
    prismaMock = {
      user: {
        findUnique: jest.fn(),
      },
      order: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    configServiceMock = {
      get: jest.fn((key: string) => {
        if (key === 'ENABLE_LEGACY_CASH_PAYMENTS') return 'true';
        return undefined;
      }),
    };
    eventEmitterMock = {
      emit: jest.fn(),
    };

    service = new LegacyCashPaymentService(
      prismaMock as never,
      configServiceMock as unknown as ConfigService,
      eventEmitterMock as unknown as EventEmitter2,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('confirms the legacy cash payment and emits the state change event', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'client-1',
      pin: 'hash',
    });
    prismaMock.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: DeliveryStatus.PENDING,
      providerOrders: [
        {
          id: 'po-1',
          items: [
            { productId: 'prod-1', quantity: 2, priceAtPurchase: '12.50' },
          ],
        },
      ],
    });

    const txOrderUpdate = jest.fn().mockResolvedValue({});
    const txProductFindMany = jest
      .fn()
      .mockResolvedValue([{ id: 'prod-1', stock: 4 }]);
    const txProductUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        product: {
          findMany: txProductFindMany,
          updateMany: txProductUpdateMany,
        },
        order: {
          update: txOrderUpdate,
        },
      }),
    );
    (argon2.verify as jest.Mock).mockResolvedValue(true);
    jest.spyOn(Date, 'now').mockReturnValue(1742745600000);
    jest.spyOn(global.Math, 'random').mockReturnValue(0.123456789);

    const result = await service.processCashPayment(
      'order-1',
      'client-1',
      '1234',
    );

    expect(txProductUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 'prod-1',
        stock: { gte: 2 },
      },
      data: {
        stock: { decrement: 2 },
      },
    });
    expect(txOrderUpdate).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: {
        status: DeliveryStatus.CONFIRMED,
        paymentRef: expect.stringMatching(/^CASH_/),
        confirmedAt: expect.any(Date),
      },
    });
    expect(eventEmitterMock.emit).toHaveBeenCalledWith('order.stateChanged', {
      orderId: 'order-1',
      status: DeliveryStatus.CONFIRMED,
      paymentRef: expect.stringMatching(/^CASH_/),
    });
    expect(result).toEqual({
      method: 'CASH',
      success: true,
      breakdown: {
        totalCharge: 28,
        logisticsDebtClient: 3,
        logisticsDebtProvider: 3,
      },
    });
  });

  it('aborts the transaction when stock is insufficient', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'client-1',
      pin: 'hash',
    });
    prismaMock.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: DeliveryStatus.PENDING,
      providerOrders: [
        {
          id: 'po-1',
          items: [
            { productId: 'prod-1', quantity: 2, priceAtPurchase: '12.50' },
          ],
        },
      ],
    });
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        product: {
          findMany: jest.fn().mockResolvedValue([{ id: 'prod-1', stock: 1 }]),
          updateMany: jest.fn(),
        },
        order: {
          update: jest.fn(),
        },
      }),
    );
    (argon2.verify as jest.Mock).mockResolvedValue(true);

    await expect(
      service.processCashPayment('order-1', 'client-1', '1234'),
    ).rejects.toThrow(
      new ConflictException('Out of stock items during cash order processing'),
    );

    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });
});
