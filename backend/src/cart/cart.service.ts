import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { CartProductPricingService } from './cart-product-pricing.service';

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cartProductPricingService: CartProductPricingService,
  ) {}

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
    const product =
      await this.cartProductPricingService.resolveActiveProductSnapshot(
        clientId,
        dto.productId,
      );

    const cartGroup = await this.getOrCreateActiveCartGroup(clientId);
    if (cartGroup.cityId && cartGroup.cityId !== product.cityId) {
      throw new BadRequestException(
        'You cannot mix products from different cities in the same cart',
      );
    }

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
            productId: product.productId,
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
            unitPriceSnapshot: product.unitPrice,
            discountPriceSnapshot: product.discountPrice,
            effectiveUnitPriceSnapshot: product.effectiveUnitPrice,
          },
        });
      } else {
        await tx.cartItem.create({
          data: {
            cartProviderId: cartProvider.id,
            productId: product.productId,
            quantity: dto.quantity,
            productReferenceSnapshot: product.reference,
            productNameSnapshot: product.name,
            imageUrlSnapshot: product.imageUrl,
            unitPriceSnapshot: product.unitPrice,
            discountPriceSnapshot: product.discountPrice,
            effectiveUnitPriceSnapshot: product.effectiveUnitPrice,
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

    const product =
      await this.cartProductPricingService.resolveActiveProductSnapshot(
        clientId,
        cartItem.productId,
      );

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.cartItem.update({
        where: { id: cartItem.id },
        data: {
          quantity: dto.quantity,
          productReferenceSnapshot: product.reference,
          productNameSnapshot: product.name,
          imageUrlSnapshot: product.imageUrl,
          unitPriceSnapshot: product.unitPrice,
          discountPriceSnapshot: product.discountPrice,
          effectiveUnitPriceSnapshot: product.effectiveUnitPrice,
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

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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

  private async recalculateCartProvider(
    tx: Prisma.TransactionClient,
    cartProviderId: string,
  ) {
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
      (
        sum: number,
        item: {
          quantity: number;
          effectiveUnitPriceSnapshot: Prisma.Decimal | null;
        },
      ) => sum + item.quantity,
      0,
    );
    const subtotalAmount = items.reduce(
      (
        sum: number,
        item: {
          quantity: number;
          effectiveUnitPriceSnapshot: Prisma.Decimal | null;
        },
      ) => sum + Number(item.effectiveUnitPriceSnapshot) * item.quantity,
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
