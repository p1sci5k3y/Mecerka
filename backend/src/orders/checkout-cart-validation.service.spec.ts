import { BadRequestException } from '@nestjs/common';
import { CheckoutCartValidationService } from './checkout-cart-validation.service';
import { Money } from '../domain/value-objects';

describe('CheckoutCartValidationService', () => {
  let service: CheckoutCartValidationService;
  let prismaMock: {
    cartGroup: { findFirst: jest.Mock };
  };

  const checkoutDto = {
    cityId: 'city-1',
    deliveryAddress: 'Calle Mayor 1',
    postalCode: '28013',
    addressReference: 'Portal 2',
    discoveryRadiusKm: 6,
  };

  beforeEach(() => {
    prismaMock = {
      cartGroup: {
        findFirst: jest.fn(),
      },
    };

    service = new CheckoutCartValidationService(prismaMock as never);
  });

  it('rejects checkout when there is no active cart', async () => {
    prismaMock.cartGroup.findFirst.mockResolvedValue(null);

    await expect(
      service.validateCartForCheckout('client-1', checkoutDto as never),
    ).rejects.toThrow(new BadRequestException('Active cart is empty'));
  });

  it('rejects checkout when the dto city does not match the cart city', async () => {
    prismaMock.cartGroup.findFirst.mockResolvedValue({
      id: 'cart-1',
      clientId: 'client-1',
      cityId: 'city-1',
      status: 'ACTIVE',
      city: {
        id: 'city-1',
        name: 'Madrid',
        active: true,
        maxDeliveryRadiusKm: 10,
        baseDeliveryFee: 3.5,
        deliveryPerKmFee: 0.9,
        extraPickupFee: 1.5,
      },
      providers: [
        {
          id: 'provider-cart-1',
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
    });

    await expect(
      service.validateCartForCheckout('client-1', {
        ...checkoutDto,
        cityId: 'city-2',
      } as never),
    ).rejects.toThrow(
      new BadRequestException(
        'Checkout city does not match the active cart city',
      ),
    );
  });

  it('filters provider groups without items and sums the remaining subtotals', async () => {
    prismaMock.cartGroup.findFirst.mockResolvedValue({
      id: 'cart-1',
      clientId: 'client-1',
      cityId: 'city-1',
      status: 'ACTIVE',
      city: {
        id: 'city-1',
        name: 'Madrid',
        active: true,
        maxDeliveryRadiusKm: 10,
        baseDeliveryFee: 3.5,
        deliveryPerKmFee: 0.9,
        extraPickupFee: 1.5,
      },
      providers: [
        {
          id: 'provider-cart-1',
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
        {
          id: 'provider-cart-2',
          providerId: 'provider-2',
          subtotalAmount: 99,
          items: [],
        },
      ],
    });

    const result = await service.validateCartForCheckout(
      'client-1',
      checkoutDto as never,
    );

    expect(result.providerOrders).toHaveLength(1);
    expect(result.providerOrders[0]?.providerId).toBe('provider-1');
    expect(result.totalPrice.equals(Money.of(20))).toBe(true);
  });
});
