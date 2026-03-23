import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  GeocodedAddress,
  GeocodingPort,
} from '../geocoding/geocoding.types';
import { CheckoutCartDto } from '../cart/dto/checkout-cart.dto';
import { Money } from '../domain/value-objects';
import { Prisma } from '@prisma/client';

type CheckoutCity = {
  name: string;
  maxDeliveryRadiusKm?: number | null;
  baseDeliveryFee: Prisma.Decimal | number | null;
  deliveryPerKmFee: Prisma.Decimal | number | null;
  extraPickupFee: Prisma.Decimal | number | null;
};

type ProviderOrderForDeliveryPlanning = {
  providerId: string;
};

type ProviderCoverage = {
  providerId: string;
  distanceKm: number;
  coverageLimitKm: number;
};

type ProviderLocation = {
  id: string;
  latitude: number | null;
  longitude: number | null;
  providerServiceRadiusKm: number | null;
};

export type DeliveryPricingSnapshot = {
  deliveryDistanceKm: number;
  runnerBaseFee: number;
  runnerPerKmFee: number;
  runnerExtraPickupFee: number;
  deliveryFee: number;
};

export type CheckoutDeliveryPlanningResult = {
  geocodedAddress: GeocodedAddress;
  providerCoverageMap: Map<string, ProviderCoverage>;
  deliveryPricing: DeliveryPricingSnapshot;
};

export class CheckoutDeliveryPlanningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geocodingService: GeocodingPort,
  ) {}

  async resolveDeliveryPlan(
    providerOrders: ProviderOrderForDeliveryPlanning[],
    dto: CheckoutCartDto,
    checkoutCity: CheckoutCity,
  ): Promise<CheckoutDeliveryPlanningResult> {
    const geocodedAddress = await this.geocodeCheckoutAddress(
      checkoutCity.name,
      dto,
    );

    const providerIds = providerOrders.map((provider) => provider.providerId);
    const providerUsers = (await this.prisma.user.findMany({
      where: {
        id: {
          in: providerIds,
        },
      },
      select: {
        id: true,
        latitude: true,
        longitude: true,
        providerServiceRadiusKm: true,
      },
    })) as ProviderLocation[];
    const providerUserMap = new Map(
      providerUsers.map((provider) => [provider.id, provider]),
    );

    const providerCoverage = providerOrders.map((provider) => {
      const providerUser = providerUserMap.get(provider.providerId);

      if (
        !providerUser ||
        providerUser.latitude == null ||
        providerUser.longitude == null
      ) {
        throw new ConflictException(
          `Provider ${provider.providerId} does not have a configured delivery location`,
        );
      }

      const distanceKm = this.roundDistance(
        this.calculateDistanceKm(
          geocodedAddress.latitude,
          geocodedAddress.longitude,
          Number(providerUser.latitude),
          Number(providerUser.longitude),
        ),
      );
      const coverageLimitKm = this.roundDistance(
        this.resolveCoverageLimitKm(
          dto.discoveryRadiusKm,
          Number(providerUser.providerServiceRadiusKm ?? 10),
          checkoutCity.maxDeliveryRadiusKm,
        ),
      );

      if (distanceKm > coverageLimitKm) {
        throw new BadRequestException(
          `Provider ${provider.providerId} is outside the delivery coverage area`,
        );
      }

      return {
        providerId: provider.providerId,
        distanceKm,
        coverageLimitKm,
      };
    });
    const providerCoverageMap = new Map(
      providerCoverage.map((coverage) => [coverage.providerId, coverage]),
    );

    return {
      geocodedAddress,
      providerCoverageMap,
      deliveryPricing: this.buildDeliveryPricingSnapshot(
        providerCoverage,
        providerOrders.length,
        checkoutCity,
      ),
    };
  }

  private async geocodeCheckoutAddress(
    cityName: string,
    dto: CheckoutCartDto,
  ): Promise<GeocodedAddress> {
    const geocodedAddress = await this.geocodingService.geocodeAddress({
      streetAddress: dto.deliveryAddress,
      postalCode: dto.postalCode,
      cityName,
    });

    if (!geocodedAddress) {
      throw new BadRequestException(
        'Delivery address could not be geocoded for the selected city',
      );
    }

    return geocodedAddress;
  }

  private roundDistance(value: number) {
    return Number(value.toFixed(2));
  }

  private calculateDistanceKm(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ) {
    const radiusKm = 6371;
    const latitudeDelta = this.deg2rad(lat2 - lat1);
    const longitudeDelta = this.deg2rad(lon2 - lon1);
    const haversine =
      Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2) +
      Math.cos(this.deg2rad(lat1)) *
        Math.cos(this.deg2rad(lat2)) *
        Math.sin(longitudeDelta / 2) *
        Math.sin(longitudeDelta / 2);
    const centralAngle =
      2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

    return radiusKm * centralAngle;
  }

  private deg2rad(deg: number) {
    return deg * (Math.PI / 180);
  }

  private resolveCoverageLimitKm(
    discoveryRadiusKm: number,
    providerServiceRadiusKm: number,
    cityMaxDeliveryRadiusKm?: number | null,
  ) {
    const limits = [discoveryRadiusKm, providerServiceRadiusKm];
    if (
      cityMaxDeliveryRadiusKm != null &&
      Number.isFinite(cityMaxDeliveryRadiusKm) &&
      cityMaxDeliveryRadiusKm > 0
    ) {
      limits.push(cityMaxDeliveryRadiusKm);
    }

    return Math.min(...limits);
  }

  private buildDeliveryPricingSnapshot(
    providerCoverage: ProviderCoverage[],
    providerCount: number,
    city: CheckoutCity,
  ) {
    const deliveryDistanceKm = this.roundDistance(
      Math.max(...providerCoverage.map((coverage) => coverage.distanceKm), 0),
    );
    const additionalPickupCount = Math.max(providerCount - 1, 0);
    const runnerBaseFee = Money.of(Number(city.baseDeliveryFee ?? 3.5)).amount;
    const runnerPerKmFee = Money.of(
      Number(city.deliveryPerKmFee ?? 0.9),
    ).amount;
    const runnerExtraPickupFee = Money.of(
      Number(city.extraPickupFee ?? 1.5),
    ).amount;
    const distanceFee =
      Money.of(runnerPerKmFee).multiply(deliveryDistanceKm).amount;
    const extraPickupCharge = Money.of(runnerExtraPickupFee).multiply(
      additionalPickupCount,
    ).amount;
    const deliveryFee = Money.of(runnerBaseFee)
      .add(Money.of(distanceFee))
      .add(Money.of(extraPickupCharge)).amount;

    return {
      deliveryDistanceKm,
      runnerBaseFee,
      runnerPerKmFee,
      runnerExtraPickupFee,
      deliveryFee,
    };
  }
}
