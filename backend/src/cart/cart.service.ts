import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';

@Injectable()
export class CartService {
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

  private buildCartInclude() {
    return {
      city: true,
      providers: {
        orderBy: {
          createdAt: 'asc' as const,
        },
        include: {
          provider: {
            select: {
              id: true,
              name: true,
            },
          },
          items: {
            orderBy: {
              createdAt: 'asc' as const,
            },
          },
        },
      },
    };
  }

  async getOrCreateActiveCartGroup(clientId: string) {
    const existing = await this.prisma.cartGroup.findFirst({
      where: {
        clientId,
        status: 'ACTIVE',
      },
      include: this.buildCartInclude(),
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.cartGroup.create({
      data: {
        clientId,
        status: 'ACTIVE',
      },
      include: this.buildCartInclude(),
    });
  }

  async ensureCartProvider(cartGroupId: string, providerId: string) {
    return this.prisma.cartProvider.upsert({
      where: {
        cartGroupId_providerId: {
          cartGroupId,
          providerId,
        },
      },
      update: {},
      create: {
        cartGroupId,
        providerId,
      },
      include: {
        provider: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async addItem(clientId: string, dto: AddCartItemDto) {
    const product = await this.prisma.product.findFirst({
      where: {
        id: dto.productId,
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

    const cartGroup = await this.getOrCreateActiveCartGroup(clientId);
    if (cartGroup.cityId && cartGroup.cityId !== product.cityId) {
      throw new BadRequestException(
        'You cannot mix products from different cities in the same cart',
      );
    }

    const clientDiscountPrice =
      product.clientDiscounts[0]?.discountPrice != null
        ? Number(product.clientDiscounts[0].discountPrice)
        : null;
    const appliedDiscountPrice = this.resolveAppliedDiscountPrice(
      Number(product.price),
      product.discountPrice != null ? Number(product.discountPrice) : null,
      clientDiscountPrice,
    );
    const effectiveUnitPrice = appliedDiscountPrice ?? Number(product.price);

    await this.prisma.$transaction(async (tx: any) => {
      if (!cartGroup.cityId) {
        await tx.cartGroup.update({
          where: { id: cartGroup.id },
          data: {
            cityId: product.cityId,
            version: {
              increment: 1,
            },
          },
        });
      }

      const cartProvider = await tx.cartProvider.upsert({
        where: {
          cartGroupId_providerId: {
            cartGroupId: cartGroup.id,
            providerId: product.providerId,
          },
        },
        update: {},
        create: {
          cartGroupId: cartGroup.id,
          providerId: product.providerId,
        },
      });

      const existingItem = await tx.cartItem.findUnique({
        where: {
          cartProviderId_productId: {
            cartProviderId: cartProvider.id,
            productId: product.id,
          },
        },
      });

      if (existingItem) {
        await tx.cartItem.update({
          where: { id: existingItem.id },
          data: {
            quantity: existingItem.quantity + dto.quantity,
            productReferenceSnapshot: product.reference,
            productNameSnapshot: product.name,
            imageUrlSnapshot: product.imageUrl,
            unitPriceSnapshot: product.price,
            discountPriceSnapshot: appliedDiscountPrice,
            effectiveUnitPriceSnapshot: effectiveUnitPrice,
          },
        });
      } else {
        await tx.cartItem.create({
          data: {
            cartProviderId: cartProvider.id,
            productId: product.id,
            quantity: dto.quantity,
            productReferenceSnapshot: product.reference,
            productNameSnapshot: product.name,
            imageUrlSnapshot: product.imageUrl,
            unitPriceSnapshot: product.price,
            discountPriceSnapshot: appliedDiscountPrice,
            effectiveUnitPriceSnapshot: effectiveUnitPrice,
          },
        });
      }

      await this.recalculateCartProvider(tx, cartProvider.id);
    });

    return this.prisma.cartGroup.findUniqueOrThrow({
      where: { id: cartGroup.id },
      include: this.buildCartInclude(),
    });
  }

  async updateItemQuantity(
    clientId: string,
    itemId: string,
    dto: { quantity: number },
  ) {
    const cartItem = await this.prisma.cartItem.findFirst({
      where: {
        id: itemId,
        cartProvider: {
          cartGroup: {
            clientId,
            status: 'ACTIVE',
          },
        },
      },
      select: {
        id: true,
        productId: true,
        cartProviderId: true,
        cartProvider: {
          select: {
            cartGroupId: true,
          },
        },
      },
    });

    if (!cartItem) {
      throw new NotFoundException('Cart item not found');
    }

    const product = await this.prisma.product.findFirst({
      where: {
        id: cartItem.productId,
        isActive: true,
        provider: {
          active: true,
          stripeAccountId: {
            not: null,
          },
        },
      },
      select: {
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

    const clientDiscountPrice =
      product.clientDiscounts[0]?.discountPrice != null
        ? Number(product.clientDiscounts[0].discountPrice)
        : null;
    const appliedDiscountPrice = this.resolveAppliedDiscountPrice(
      Number(product.price),
      product.discountPrice != null ? Number(product.discountPrice) : null,
      clientDiscountPrice,
    );
    const effectiveUnitPrice = appliedDiscountPrice ?? Number(product.price);

    await this.prisma.$transaction(async (tx: any) => {
      await tx.cartItem.update({
        where: { id: cartItem.id },
        data: {
          quantity: dto.quantity,
          productReferenceSnapshot: product.reference,
          productNameSnapshot: product.name,
          imageUrlSnapshot: product.imageUrl,
          unitPriceSnapshot: product.price,
          discountPriceSnapshot: appliedDiscountPrice,
          effectiveUnitPriceSnapshot: effectiveUnitPrice,
        },
      });

      await this.recalculateCartProvider(tx, cartItem.cartProviderId);
    });

    return this.prisma.cartGroup.findUniqueOrThrow({
      where: { id: cartItem.cartProvider.cartGroupId },
      include: this.buildCartInclude(),
    });
  }

  async removeItem(clientId: string, itemId: string) {
    const cartItem = await this.prisma.cartItem.findFirst({
      where: {
        id: itemId,
        cartProvider: {
          cartGroup: {
            clientId,
            status: 'ACTIVE',
          },
        },
      },
      select: {
        id: true,
        cartProviderId: true,
        cartProvider: {
          select: {
            cartGroupId: true,
          },
        },
      },
    });

    if (!cartItem) {
      throw new NotFoundException('Cart item not found');
    }

    await this.prisma.$transaction(async (tx: any) => {
      await tx.cartItem.delete({
        where: { id: cartItem.id },
      });

      const providerState = await this.recalculateCartProvider(
        tx,
        cartItem.cartProviderId,
      );

      if (providerState.itemCount === 0) {
        await tx.cartProvider.delete({
          where: { id: cartItem.cartProviderId },
        });
      }
    });

    return this.prisma.cartGroup.findUniqueOrThrow({
      where: { id: cartItem.cartProvider.cartGroupId },
      include: this.buildCartInclude(),
    });
  }

  private async recalculateCartProvider(tx: any, cartProviderId: string) {
    const items = await tx.cartItem.findMany({
      where: {
        cartProviderId,
      },
      select: {
        quantity: true,
        effectiveUnitPriceSnapshot: true,
      },
    });

    const itemCount = items.reduce(
      (sum: number, item: any) => sum + item.quantity,
      0,
    );
    const subtotalAmount = items.reduce(
      (sum: number, item: any) =>
        sum + Number(item.effectiveUnitPriceSnapshot) * item.quantity,
      0,
    );

    await tx.cartProvider.update({
      where: {
        id: cartProviderId,
      },
      data: {
        itemCount,
        subtotalAmount,
      },
    });

    return {
      itemCount,
      subtotalAmount,
    };
  }
}
