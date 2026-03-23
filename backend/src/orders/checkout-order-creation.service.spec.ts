import { BadRequestException } from '@nestjs/common';
import { DeliveryStatus, ProviderOrderStatus } from '@prisma/client';
import { CheckoutOrderCreationService } from './checkout-order-creation.service';

describe('CheckoutOrderCreationService', () => {
  let service: CheckoutOrderCreationService;
  let prismaMock: {
    $transaction: jest.Mock;
  };
  let stockReservationServiceMock: {
    checkStockAvailability: jest.Mock;
  };

  beforeEach(() => {
    prismaMock = {
      $transaction: jest.fn(),
    };
    stockReservationServiceMock = {
      checkStockAvailability: jest.fn().mockResolvedValue(undefined),
    };

    service = new CheckoutOrderCreationService(
      prismaMock as never,
      stockReservationServiceMock as never,
    );
  });

  it('creates the root order, provider suborders, summary document and checks out the cart', async () => {
    const txMock = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      order: {
        create: jest.fn().mockResolvedValue({
          id: 'order-1',
          clientId: 'client-1',
          status: DeliveryStatus.PENDING,
          providerOrders: [
            {
              id: 'po-1',
              providerId: 'provider-1',
              status: ProviderOrderStatus.PENDING,
              items: [{ productId: 'prod-1', quantity: 2 }],
            },
          ],
        }),
      },
      orderSummaryDocument: {
        create: jest.fn().mockResolvedValue({}),
      },
      cartGroup: {
        update: jest.fn().mockResolvedValue({}),
      },
    };
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback(txMock),
    );

    const result = await service.createOrderWithSuborders(
      'client-1',
      {
        cityId: 'city-1',
        deliveryAddress: 'Calle Mayor 1',
        postalCode: '28013',
        addressReference: 'Portal 2',
        discoveryRadiusKm: 6,
      } as never,
      { id: 'cart-1', cityId: 'city-1' },
      [
        {
          providerId: 'provider-1',
          subtotalAmount: 20,
          items: [
            {
              productId: 'prod-1',
              quantity: 2,
              effectiveUnitPriceSnapshot: 10,
              unitPriceSnapshot: 10,
              discountPriceSnapshot: null,
            },
          ],
        },
      ],
      {
        geocodedAddress: {
          latitude: 40.4168,
          longitude: -3.7038,
          formattedAddress: 'Calle Mayor 1, 28013 Madrid, Spain',
        },
        providerCoverageMap: new Map([
          [
            'provider-1',
            {
              providerId: 'provider-1',
              distanceKm: 0.5,
              coverageLimitKm: 6,
            },
          ],
        ]),
        deliveryPricing: {
          deliveryDistanceKm: 0.5,
          runnerBaseFee: 3.5,
          runnerPerKmFee: 0.9,
          runnerExtraPickupFee: 1.5,
          deliveryFee: 3.95,
        },
      },
      20,
      'idem-1',
    );

    expect(
      stockReservationServiceMock.checkStockAvailability,
    ).toHaveBeenCalledWith(
      [
        {
          productId: 'prod-1',
          quantity: 2,
          effectiveUnitPriceSnapshot: 10,
          unitPriceSnapshot: 10,
          discountPriceSnapshot: null,
        },
      ],
      ['prod-1'],
      txMock,
    );
    expect(txMock.order.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clientId: 'client-1',
        cityId: 'city-1',
        totalPrice: 20,
        deliveryFee: 3.95,
        checkoutIdempotencyKey: 'idem-1',
        providerOrders: {
          create: [
            expect.objectContaining({
              providerId: 'provider-1',
              status: ProviderOrderStatus.PENDING,
              subtotalAmount: 20,
              deliveryDistanceKm: 0.5,
              coverageLimitKm: 6,
            }),
          ],
        },
      }),
      include: {
        providerOrders: {
          include: {
            items: true,
          },
        },
      },
    });
    expect(txMock.orderSummaryDocument.create).toHaveBeenCalledWith({
      data: {
        orderId: 'order-1',
        displayNumber: 'SUM-ORDER-1',
        totalAmount: 20,
        currency: 'EUR',
      },
    });
    expect(txMock.cartGroup.update).toHaveBeenCalledWith({
      where: { id: 'cart-1' },
      data: {
        status: 'CHECKED_OUT',
        version: {
          increment: 1,
        },
      },
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: 'order-1',
        clientId: 'client-1',
      }),
    );
  });

  it('rejects checkout when no requested products remain after grouping', async () => {
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        $executeRaw: jest.fn(),
        order: { create: jest.fn() },
        orderSummaryDocument: { create: jest.fn() },
        cartGroup: { update: jest.fn() },
      }),
    );

    await expect(
      service.createOrderWithSuborders(
        'client-1',
        {
          cityId: 'city-1',
          deliveryAddress: 'Calle Mayor 1',
          postalCode: '28013',
          addressReference: 'Portal 2',
          discoveryRadiusKm: 6,
        } as never,
        { id: 'cart-1', cityId: 'city-1' },
        [],
        {
          geocodedAddress: {
            latitude: 40.4168,
            longitude: -3.7038,
            formattedAddress: 'Calle Mayor 1, 28013 Madrid, Spain',
          },
          providerCoverageMap: new Map(),
          deliveryPricing: {
            deliveryDistanceKm: 0,
            runnerBaseFee: 3.5,
            runnerPerKmFee: 0.9,
            runnerExtraPickupFee: 1.5,
            deliveryFee: 3.5,
          },
        },
        0,
        'idem-empty',
      ),
    ).rejects.toThrow(
      new BadRequestException('Active cart has no items to checkout'),
    );
  });
});
