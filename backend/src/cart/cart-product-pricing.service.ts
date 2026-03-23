import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type CartProductSnapshot = {
  productId: string;
  providerId: string;
  cityId: string;
  reference: string;
  name: string;
  imageUrl: string | null;
  unitPrice: number;
  discountPrice: number | null;
  effectiveUnitPrice: number;
};

@Injectable()
export class CartProductPricingService {
  constructor(private readonly prisma: PrismaService) {}

  private resolveAppliedDiscountPrice(
    basePrice: number,
    publicDiscountPrice?: number | null,
    clientDiscountPrice?: number | null,
  ) {
    const discountCandidates = [
      publicDiscountPrice,
      clientDiscountPrice,
    ].filter(
      (value): value is number =>
        value != null &&
        Number.isFinite(value) &&
        value > 0 &&
        value < basePrice,
    );

    if (discountCandidates.length === 0) {
      return null;
    }

    return Math.min(...discountCandidates);
  }

  async resolveActiveProductSnapshot(clientId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        id: productId,
        isActive: true,
        provider: {
          active: true,
          stripeAccountId: {
            not: null,
          },
        },
      },
      select: {
        id: true,
        providerId: true,
        cityId: true,
        reference: true,
        name: true,
        imageUrl: true,
        price: true,
        discountPrice: true,
        clientDiscounts: {
          where: {
            clientId,
            active: true,
          },
          orderBy: {
            updatedAt: 'desc',
          },
          take: 1,
          select: {
            discountPrice: true,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Product not available');
    }

    const unitPrice = Number(product.price);
    const clientDiscountPrice =
      product.clientDiscounts[0]?.discountPrice != null
        ? Number(product.clientDiscounts[0].discountPrice)
        : null;
    const discountPrice = this.resolveAppliedDiscountPrice(
      unitPrice,
      product.discountPrice != null ? Number(product.discountPrice) : null,
      clientDiscountPrice,
    );

    return {
      productId: product.id,
      providerId: product.providerId,
      cityId: product.cityId,
      reference: product.reference,
      name: product.name,
      imageUrl: product.imageUrl,
      unitPrice,
      discountPrice,
      effectiveUnitPrice: discountPrice ?? unitPrice,
    } satisfies CartProductSnapshot;
  }
}
