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
  constructor(private prisma: PrismaService) {}

  create(createProductDto: CreateProductDto, providerId: number) {
    return this.prisma.product.create({
      data: {
        ...createProductDto,
        providerId,
      },
    });
  }

  findAll() {
    return this.prisma.product.findMany({
      include: {
        city: true,
        category: true,
        provider: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }

  async findOne(id: number) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        city: true,
        category: true,
        provider: {
          select: { id: true, name: true, email: true },
        },
      },
    });
    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }
    return product;
  }

  async update(
    id: number,
    updateProductDto: UpdateProductDto,
    providerId: number,
  ) {
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

  async remove(id: number, providerId: number) {
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
