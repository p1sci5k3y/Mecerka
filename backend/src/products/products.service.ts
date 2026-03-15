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

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

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
      reservations.map((reservation: any) => [
        reservation.productId,
        Number(reservation._sum.quantity ?? 0),
      ]),
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
}
