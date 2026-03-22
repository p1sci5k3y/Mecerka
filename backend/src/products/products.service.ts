import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertDiscountPriceValid,
  normalizeProductReference,
} from './product-catalog.utils';
import { UpsertClientProductDiscountDto } from './dto/upsert-client-product-discount.dto';
import { UpdateClientProductDiscountDto } from './dto/update-client-product-discount.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeMoney(value: number) {
    return Number(value.toFixed(2));
  }

  private async attachAvailableStock<T extends { id: string; stock: number }>(
    products: T[],
  ): Promise<Array<T & { availableStock: number }>> {
    if (products.length === 0) {
      return [];
    }

    const reservations = await (this.prisma as any).stockReservation.groupBy({
      by: ['productId'],
      where: {
        productId: { in: products.map((product) => product.id) },
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
      },
      _sum: {
        quantity: true,
      },
    });

    const reservedByProductId = new Map<string, number>(
      reservations.map(
        (reservation: {
          productId: string;
          _sum: { quantity: number | null };
        }) => [reservation.productId, Number(reservation._sum.quantity ?? 0)],
      ),
    );

    return products.map((product) => ({
      ...product,
      availableStock: Math.max(
        Number(product.stock) -
          Number(reservedByProductId.get(product.id) ?? 0),
        0,
      ),
    }));
  }

  private async ensureUniqueReference(
    providerId: string,
    requestedReference: string,
    ignoreProductId?: string,
  ): Promise<string> {
    const baseReference = normalizeProductReference(requestedReference);

    if (!baseReference) {
      throw new BadRequestException('Product reference cannot be empty');
    }

    let candidate = baseReference;
    let suffix = 1;

    while (true) {
      const existing = await this.prisma.product.findFirst({
        where: {
          providerId,
          reference: candidate,
          ...(ignoreProductId ? { NOT: { id: ignoreProductId } } : {}),
        },
        select: { id: true },
      });

      if (!existing) {
        return candidate;
      }

      candidate = `${baseReference}-${suffix}`;
      suffix += 1;
    }
  }

  private async resolveReference(
    providerId: string,
    createProductDto: CreateProductDto | UpdateProductDto,
    ignoreProductId?: string,
  ): Promise<string | undefined> {
    if (createProductDto.reference) {
      return this.ensureUniqueReference(
        providerId,
        createProductDto.reference,
        ignoreProductId,
      );
    }

    if ('name' in createProductDto && createProductDto.name) {
      return this.ensureUniqueReference(
        providerId,
        createProductDto.name,
        ignoreProductId,
      );
    }

    return undefined;
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

  private mapClientDiscount(discount: {
    id: string;
    providerId: string;
    clientId: string;
    productId: string;
    discountPrice: number | { toNumber?: () => number } | null;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
    client?: { id: string; name: string | null; email: string } | null;
  }) {
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

  async create(createProductDto: CreateProductDto, providerId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: providerId },
      select: { stripeAccountId: true },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${providerId} not found`);
    }

    if (!user.stripeAccountId) {
      throw new ForbiddenException(
        'Complete your Stripe financial registration before publishing products.',
      );
    }

    assertDiscountPriceValid(
      createProductDto.price,
      createProductDto.discountPrice,
    );
    const reference =
      (await this.resolveReference(providerId, createProductDto)) ??
      normalizeProductReference(createProductDto.name);

    return this.prisma.product.create({
      data: {
        ...createProductDto,
        reference,
        providerId,
      },
    });
  }

  async findAll() {
    const products = await this.prisma.product.findMany({
      where: {
        isActive: true,
        provider: { stripeAccountId: { not: null } },
      },
      include: {
        city: true,
        category: true,
        provider: {
          select: { id: true, name: true }, // email excluded for privacy
        },
      },
    });

    return this.attachAvailableStock(products);
  }

  async findMyProducts(providerId: string) {
    const products = await this.prisma.product.findMany({
      where: { providerId },
      include: {
        city: true,
        category: true,
        provider: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return this.attachAvailableStock(products);
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        id,
        isActive: true,
        provider: { stripeAccountId: { not: null } },
      },
      include: {
        city: true,
        category: true,
        provider: {
          select: { id: true, name: true }, // email excluded for privacy
        },
      },
    });
    if (!product) {
      throw new NotFoundException(
        `Product with ID ${id} not found or inactive`,
      );
    }

    const [productWithAvailability] = await this.attachAvailableStock([
      product,
    ]);
    return productWithAvailability;
  }

  async update(
    id: string,
    updateProductDto: UpdateProductDto,
    providerId: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: providerId },
      select: { stripeAccountId: true },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${providerId} not found`);
    }

    if (!user.stripeAccountId) {
      throw new ForbiddenException(
        'Complete your Stripe financial registration before managing your stock.',
      );
    }

    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    if (product.providerId !== providerId) {
      throw new ForbiddenException(
        'You are not allowed to update this product',
      );
    }

    const currentDiscountPrice =
      product.discountPrice === null ? null : Number(product.discountPrice);
    assertDiscountPriceValid(
      updateProductDto.price ?? Number(product.price),
      updateProductDto.discountPrice ?? currentDiscountPrice,
    );
    const reference = await this.resolveReference(
      providerId,
      updateProductDto,
      id,
    );

    return this.prisma.product.update({
      where: { id },
      data: {
        ...updateProductDto,
        ...(reference ? { reference } : {}),
      },
    });
  }

  async remove(id: string, providerId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    if (product.providerId !== providerId) {
      throw new ForbiddenException(
        'You are not allowed to delete this product',
      );
    }

    return this.prisma.product.delete({
      where: { id },
    });
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
