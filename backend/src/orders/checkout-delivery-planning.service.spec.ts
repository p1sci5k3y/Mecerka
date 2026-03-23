import { BadRequestException, ConflictException } from '@nestjs/common';
import { CheckoutDeliveryPlanningService } from './checkout-delivery-planning.service';
import { Money } from '../domain/value-objects';

describe('CheckoutDeliveryPlanningService', () => {
  let service: CheckoutDeliveryPlanningService;
  let prismaMock: {
    user: { findMany: jest.Mock };
  };
  let geocodingMock: {
    geocodeAddress: jest.Mock;
  };

  const checkoutDto = {
    cityId: 'city-1',
    deliveryAddress: 'Calle Mayor 1',
    postalCode: '28013',
    addressReference: 'Portal 2',
    discoveryRadiusKm: 6,
  };

  const checkoutCity = {
    name: 'Madrid',
    maxDeliveryRadiusKm: 10,
    baseDeliveryFee: 3.5,
    deliveryPerKmFee: 0.9,
    extraPickupFee: 1.5,
  };

  beforeEach(() => {
    prismaMock = {
      user: {
        findMany: jest.fn(),
      },
    };
    geocodingMock = {
      geocodeAddress: jest.fn().mockResolvedValue({
        latitude: 40.4168,
        longitude: -3.7038,
        formattedAddress: 'Calle Mayor 1, 28013 Madrid, Spain',
      }),
    };

    service = new CheckoutDeliveryPlanningService(
      prismaMock as never,
      geocodingMock as never,
    );
  });

  it('builds provider coverage and delivery pricing for a multi-provider checkout', async () => {
    prismaMock.user.findMany.mockResolvedValue([
      {
        id: 'provider-1',
        latitude: 40.41,
        longitude: -3.7,
        providerServiceRadiusKm: 10,
      },
      {
        id: 'provider-2',
        latitude: 40.42,
        longitude: -3.69,
        providerServiceRadiusKm: 8,
      },
    ]);

    const result = await service.resolveDeliveryPlan(
      [{ providerId: 'provider-1' }, { providerId: 'provider-2' }],
      checkoutDto as never,
      checkoutCity,
    );

    expect(geocodingMock.geocodeAddress).toHaveBeenCalledWith({
      streetAddress: 'Calle Mayor 1',
      postalCode: '28013',
      cityName: 'Madrid',
    });
    expect(result.geocodedAddress.latitude).toBe(40.4168);
    expect(result.providerCoverageMap.get('provider-1')).toEqual({
      providerId: 'provider-1',
      distanceKm: expect.any(Number),
      coverageLimitKm: 6,
    });
    expect(result.providerCoverageMap.get('provider-2')).toEqual({
      providerId: 'provider-2',
      distanceKm: expect.any(Number),
      coverageLimitKm: 6,
    });
    expect(result.deliveryPricing.deliveryDistanceKm).toEqual(
      expect.any(Number),
    );
    expect(result.deliveryPricing.runnerBaseFee.equals(Money.of(3.5))).toBe(
      true,
    );
    expect(result.deliveryPricing.runnerPerKmFee.equals(Money.of(0.9))).toBe(
      true,
    );
    expect(
      result.deliveryPricing.runnerExtraPickupFee.equals(Money.of(1.5)),
    ).toBe(true);
    expect(result.deliveryPricing.deliveryFee.amount).toBeGreaterThan(3.5);
  });

  it('rejects providers without configured coordinates', async () => {
    prismaMock.user.findMany.mockResolvedValue([
      {
        id: 'provider-1',
        latitude: null,
        longitude: null,
        providerServiceRadiusKm: 10,
      },
    ]);

    await expect(
      service.resolveDeliveryPlan(
        [{ providerId: 'provider-1' }],
        checkoutDto as never,
        checkoutCity,
      ),
    ).rejects.toThrow(
      new ConflictException(
        'Provider provider-1 does not have a configured delivery location',
      ),
    );
  });

  it('rejects providers outside the effective coverage limit', async () => {
    prismaMock.user.findMany.mockResolvedValue([
      {
        id: 'provider-1',
        latitude: 40.8,
        longitude: -3.2,
        providerServiceRadiusKm: 10,
      },
    ]);

    await expect(
      service.resolveDeliveryPlan(
        [{ providerId: 'provider-1' }],
        checkoutDto as never,
        checkoutCity,
      ),
    ).rejects.toThrow(
      new BadRequestException(
        'Provider provider-1 is outside the delivery coverage area',
      ),
    );
  });
});
