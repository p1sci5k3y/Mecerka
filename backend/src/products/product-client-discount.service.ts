import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { assertDiscountPriceValid } from './product-catalog.utils';
import { UpsertClientProductDiscountDto } from './dto/upsert-client-product-discount.dto';
import { UpdateClientProductDiscountDto } from './dto/update-client-product-discount.dto';

type ClientDiscountRecord = {
  id: string;
  providerId: string;
  clientId: string;
  productId: string;
  discountPrice: number | { toNumber?: () => number } | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  client?: { id: string; name: string | null; email: string } | null;
};

@Injectable()
export class ProductClientDiscountService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeMoney(value: number) {
    return Number(value.toFixed(2));
  }

  private async assertProviderOwnedProduct(
    productId: string,
    providerId: string,
  ) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        providerId: true,
        price: true,
        discountPrice: true,
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    if (product.providerId !== providerId) {
      throw new ForbiddenException(
        'You are not allowed to manage discounts for this product',
      );
    }

    return product;
  }

  private async assertClientUser(clientId: string) {
    const client = await this.prisma.user.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        active: true,
        roles: true,
        name: true,
        email: true,
      },
    });

    if (!client?.active) {
      throw new NotFoundException('Target client not found or inactive');
    }

    if (!client.roles.includes('CLIENT')) {
      throw new BadRequestException('Target user does not have CLIENT role');
    }

    return client;
  }

  private mapClientDiscount(discount: ClientDiscountRecord) {
    return {
      id: discount.id,
      providerId: discount.providerId,
      clientId: discount.clientId,
      productId: discount.productId,
      discountPrice: Number(discount.discountPrice),
      active: discount.active,
      createdAt: discount.createdAt,
      updatedAt: discount.updatedAt,
      client: discount.client
        ? {
            id: discount.client.id,
            name: discount.client.name,
            email: discount.client.email,
          }
        : undefined,
    };
  }

  async listClientDiscounts(productId: string, providerId: string) {
    await this.assertProviderOwnedProduct(productId, providerId);

    const discounts = await this.prisma.providerClientProductDiscount.findMany({
      where: {
        productId,
        providerId,
      },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: [{ active: 'desc' }, { updatedAt: 'desc' }],
    });

    return discounts.map((discount) => this.mapClientDiscount(discount));
  }

  async upsertClientDiscount(
    productId: string,
    providerId: string,
    dto: UpsertClientProductDiscountDto,
  ) {
    const product = await this.assertProviderOwnedProduct(
      productId,
      providerId,
    );
    const client = await this.assertClientUser(dto.clientId);
    const normalizedDiscountPrice = this.normalizeMoney(dto.discountPrice);

    assertDiscountPriceValid(Number(product.price), normalizedDiscountPrice);

    const discount = await this.prisma.providerClientProductDiscount.upsert({
      where: {
        providerId_clientId_productId: {
          providerId,
          clientId: client.id,
          productId,
        },
      },
      update: {
        discountPrice: normalizedDiscountPrice,
        active: dto.active ?? true,
      },
      create: {
        providerId,
        clientId: client.id,
        productId,
        discountPrice: normalizedDiscountPrice,
        active: dto.active ?? true,
      },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return this.mapClientDiscount(discount);
  }

  async updateClientDiscount(
    productId: string,
    discountId: string,
    providerId: string,
    dto: UpdateClientProductDiscountDto,
  ) {
    const product = await this.assertProviderOwnedProduct(
      productId,
      providerId,
    );
    const existing = await this.prisma.providerClientProductDiscount.findFirst({
      where: {
        id: discountId,
        productId,
        providerId,
      },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Provider client discount not found');
    }

    const nextDiscountPrice =
      dto.discountPrice != null
        ? this.normalizeMoney(dto.discountPrice)
        : Number(existing.discountPrice);

    assertDiscountPriceValid(Number(product.price), nextDiscountPrice);

    const updated = await this.prisma.providerClientProductDiscount.update({
      where: {
        id: existing.id,
      },
      data: {
        ...(dto.discountPrice != null
          ? { discountPrice: nextDiscountPrice }
          : {}),
        ...(dto.active != null ? { active: dto.active } : {}),
      },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return this.mapClientDiscount(updated);
  }
}
