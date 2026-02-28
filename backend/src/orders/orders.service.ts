import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, Role } from '@prisma/client';
import * as argon2 from 'argon2';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) { }

  async create(createOrderDto: CreateOrderDto, clientId: number) {
    const { items, deliveryAddress, pin } = createOrderDto;

    // 0. Verify Transactional PIN
    const user = await this.prisma.user.findUnique({ where: { id: clientId } });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    if (!user.pin) {
      throw new BadRequestException('Debes configurar un PIN de compra en tu perfil.');
    }
    const isPinValid = await argon2.verify(user.pin, pin);
    if (!isPinValid) {
      throw new UnauthorizedException('PIN de compra incorrecto.');
    }

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
          deliveryAddress,
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

  findAll(userId: number, roles: Role[]) {
    if (roles.includes(Role.PROVIDER)) {
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
    } else if (roles.includes(Role.RUNNER)) {
      return this.prisma.order.findMany({
        where: { runnerId: userId },
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
    } else if (roles.includes(Role.CLIENT)) {
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
    }
    return [];
  }

  async findOne(id: number, userId: number, roles: Role[]) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });
    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }

    if (roles.includes(Role.ADMIN)) return order;

    const isClient = order.clientId === userId;
    const isRunner = order.runnerId === userId;
    const isProvider = order.items.some((item) => item.product.providerId === userId);

    if (!isClient && !isRunner && !isProvider) {
      throw new ForbiddenException('You do not have permission to view this order');
    }

    return order;
  }

  async getAvailableOrders() {
    return this.prisma.order.findMany({
      where: {
        status: 'PENDING',
        runnerId: null,
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
        city: true,
        client: {
          select: { name: true }, // Minimize data exposure
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async acceptOrder(id: number, runnerId: number) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');

    const result = await this.prisma.order.updateMany({
      where: {
        id,
        status: 'PENDING',
        runnerId: null,
        clientId: { not: runnerId },
      },
      data: {
        runnerId,
        status: 'CONFIRMED',
      },
    });

    if (result.count === 0) {
      throw new BadRequestException('Order is already accepted, not pending, or you cannot accept your own order');
    }

    return this.prisma.order.findUnique({ where: { id } });
  }

  async completeOrder(id: number, runnerId: number) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');

    const result = await this.prisma.order.updateMany({
      where: {
        id,
        runnerId,
        status: 'CONFIRMED',
      },
      data: {
        status: 'COMPLETED',
      },
    });

    if (result.count === 0) {
      throw new BadRequestException('Order cannot be completed in its current state, or you are not the assigned runner');
    }

    return this.prisma.order.findUnique({ where: { id } });
  }

  async getProviderStats(providerId: number) {
    const orders = await this.prisma.order.findMany({
      where: {
        items: {
          some: {
            product: {
              providerId,
            },
          },
        },
        status: { not: 'CANCELLED' },
      },
      include: {
        items: {
          where: {
            product: {
              providerId,
            },
          },
        },
      },
    });

    const totalRevenue = orders.reduce((sum, order) => {
      const orderTotal = order.items.reduce((acc, item) => acc + Number(item.priceAtPurchase) * item.quantity, 0);
      return sum + orderTotal;
    }, 0);

    const totalOrders = orders.length;

    const itemsSold = orders.reduce((sum, order) => {
      const orderItems = order.items.reduce((acc, item) => acc + item.quantity, 0);
      return sum + orderItems;
    }, 0);

    // Calculate average ticket
    const averageTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    return {
      totalRevenue,
      totalOrders,
      itemsSold,
      averageTicket,
    };
  }

  async getProviderSalesChart(providerId: number) {
    // Get orders from last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: thirtyDaysAgo },
        items: {
          some: {
            product: { providerId },
          },
        },
        status: { not: 'CANCELLED' },
      },
      include: {
        items: {
          where: { product: { providerId } },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by date
    const salesByDate: Record<string, number> = {};

    orders.forEach(order => {
      const date = order.createdAt.toISOString().split('T')[0];
      const orderTotal = order.items.reduce((acc, item) => acc + Number(item.priceAtPurchase) * item.quantity, 0);
      salesByDate[date] = (salesByDate[date] || 0) + orderTotal;
    });

    // Format for frontend (array of { date, amount })
    return Object.entries(salesByDate).map(([date, amount]) => ({
      date,
      amount,
    }));
  }

  async getProviderTopProducts(providerId: number) {
    const orders = await this.prisma.order.findMany({
      where: {
        items: {
          some: { product: { providerId } },
        },
        status: { not: 'CANCELLED' },
      },
      include: {
        items: {
          where: { product: { providerId } },
          include: { product: true },
        },
      },
    });

    const productStats: Record<number, { name: string; revenue: number; quantity: number }> = {};

    orders.forEach(order => {
      order.items.forEach(item => {
        if (!productStats[item.productId]) {
          productStats[item.productId] = {
            name: item.product.name,
            revenue: 0,
            quantity: 0,
          };
        }
        productStats[item.productId].revenue += Number(item.priceAtPurchase) * item.quantity;
        productStats[item.productId].quantity += item.quantity;
      });
    });

    return Object.values(productStats)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5); // Return top 5
  }
}
