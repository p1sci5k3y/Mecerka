import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) { }

  async create(createProductDto: CreateProductDto, providerId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: providerId },
      select: { stripeAccountId: true },
    });

    if (!user?.stripeAccountId) {
      throw new ForbiddenException('Debes completar tu registro financiero en Stripe antes de publicar productos.');
    }

    return this.prisma.product.create({
      data: {
        ...createProductDto,
        providerId,
      },
    });
  }

  findAll() {
    return this.prisma.product.findMany({
      where: {
        isActive: true,
        provider: { stripeAccountId: { not: null } }
      },
      include: {
        city: true,
        category: true,
        provider: {
          select: { id: true, name: true }, // email excluded for privacy
        },
      },
    });
  }

  findMyProducts(providerId: string) {
    return this.prisma.product.findMany({
      where: { providerId },
      include: {
        city: true,
        category: true,
        provider: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        id,
        isActive: true,
        provider: { stripeAccountId: { not: null } }
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
      throw new NotFoundException(`Product with ID ${id} not found or inactive`);
    }
    return product;
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

    if (!user?.stripeAccountId) {
      throw new ForbiddenException('Debes completar tu registro financiero en Stripe antes de gestionar tu stock.');
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

    return this.prisma.product.update({
      where: { id },
      data: updateProductDto,
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
