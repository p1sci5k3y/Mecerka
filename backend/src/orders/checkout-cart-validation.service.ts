import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CheckoutCartDto } from '../cart/dto/checkout-cart.dto';
import { Money } from '../domain/value-objects';
import { Prisma } from '@prisma/client';

type CheckoutCity = {
  id: string;
  name: string;
  active: boolean;
  maxDeliveryRadiusKm: number | null;
  baseDeliveryFee: Prisma.Decimal | number | null;
  deliveryPerKmFee: Prisma.Decimal | number | null;
  extraPickupFee: Prisma.Decimal | number | null;
};

type CartItemSnapshot = {
  productId: string;
  quantity: number;
  effectiveUnitPriceSnapshot: Prisma.Decimal | number | string;
  unitPriceSnapshot: Prisma.Decimal | number | string;
  discountPriceSnapshot: Prisma.Decimal | number | string | null;
};

export type CheckoutProviderGroup = {
  id: string;
  providerId: string;
  subtotalAmount: Prisma.Decimal | number | string;
  items: CartItemSnapshot[];
};

export type ValidatedCheckoutCart = {
  cart: {
    id: string;
    clientId: string;
    cityId: string;
    status: string;
    city: CheckoutCity | null;
    providers: CheckoutProviderGroup[];
  };
  checkoutCity: CheckoutCity;
  providerOrders: CheckoutProviderGroup[];
  totalPrice: Money;
};

@Injectable()
export class CheckoutCartValidationService {
  constructor(private readonly prisma: PrismaService) {}

  async validateCartForCheckout(
    clientId: string,
    dto: CheckoutCartDto,
  ): Promise<ValidatedCheckoutCart> {
    const cart = await this.prisma.cartGroup.findFirst({
      where: {
        clientId,
      },
      include: {
        city: {
          select: {
            id: true,
            name: true,
            active: true,
            maxDeliveryRadiusKm: true,
            baseDeliveryFee: true,
            deliveryPerKmFee: true,
            extraPickupFee: true,
          },
        },
        providers: {
          include: {
            items: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!cart) {
      throw new BadRequestException('Active cart is empty');
    }

    if (cart.status !== 'ACTIVE') {
      throw new BadRequestException('Cart is not active');
    }

    if (cart.providers.length === 0) {
      throw new BadRequestException('Active cart is empty');
    }

    if (!cart.cityId) {
      throw new BadRequestException('Active cart has no city assigned');
    }

    if (!cart.city) {
      throw new BadRequestException(
        'Active cart city configuration is missing',
      );
    }

    const checkoutCity = cart.city;

    if (!checkoutCity.active) {
      throw new BadRequestException('Active cart belongs to an inactive city');
    }

    if (dto.cityId !== cart.cityId) {
      throw new BadRequestException(
        'Checkout city does not match the active cart city',
      );
    }

    const providerOrders = cart.providers.filter(
      (provider) => provider.items.length > 0,
    );

    if (providerOrders.length === 0) {
      throw new BadRequestException('Active cart has no items to checkout');
    }

    const totalPrice = providerOrders.reduce(
      (acc: Money, provider) =>
        acc.add(Money.of(Number(provider.subtotalAmount))),
      Money.of(0),
    );

    return {
      cart: {
        ...cart,
        cityId: cart.cityId,
      },
      checkoutCity,
      providerOrders,
      totalPrice,
    };
  }
}
