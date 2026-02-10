import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, Role } from '@prisma/client';

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}

  async create(createOrderDto: CreateOrderDto, clientId: number) {
    const { items } = createOrderDto;

    // 1. Fetch products
    const productIds = items.map((item) => item.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
    });

    if (products.length !== productIds.length) {
      throw new NotFoundException('Some products not found');
    }

    // 2. Validate City (Single city rule)
    const distinctCityIds = new Set(products.map((p) => p.cityId));
    if (distinctCityIds.size > 1) {
      throw new BadRequestException(
        'All products must belong to the same city',
      );
    }
    const cityId = distinctCityIds.values().next().value as number;

    // 3. Verify Stock and Calculate Total
    let totalPrice = 0;
    const orderItemsData: Prisma.OrderItemCreateWithoutOrderInput[] = [];

    for (const item of items) {
      const product = products.find((p) => p.id === item.productId);
      if (!product) {
        throw new NotFoundException(`Product ${item.productId} not found`);
      }

      if (product.stock < item.quantity) {
        throw new BadRequestException(
          `Insufficient stock for product ${product.name}`,
        );
      }

      const itemTotal = Number(product.price) * item.quantity;
      totalPrice += itemTotal;

      orderItemsData.push({
        quantity: item.quantity,
        priceAtPurchase: product.price,
        product: { connect: { id: product.id } },
      });
    }

    // 4. Transaction: Create Order & Update Stock
    return this.prisma.$transaction(async (tx) => {
      // Create Order
      const order = await tx.order.create({
        data: {
          clientId,
          cityId,
          totalPrice,
          status: 'PENDING',
          items: {
            create: orderItemsData,
          },
        },
        include: {
          items: true,
        },
      });

      // Update Stocks
      for (const item of items) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stock: {
              decrement: item.quantity,
            },
          },
        });
      }

      return order;
    });
  }

  findAll(userId: number, role: string) {
    if (role === Role.CLIENT) {
      return this.prisma.order.findMany({
        where: { clientId: userId },
        include: {
          items: {
            include: {
              product: true,
            },
          },
          city: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    } else if (role === Role.PROVIDER) {
      return this.prisma.order.findMany({
        where: {
          items: {
            some: {
              product: {
                providerId: userId,
              },
            },
          },
        },
        include: {
          items: {
            where: {
              product: {
                providerId: userId,
              },
            },
            include: {
              product: true,
            },
          },
          city: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    }
    return [];
  }
}
