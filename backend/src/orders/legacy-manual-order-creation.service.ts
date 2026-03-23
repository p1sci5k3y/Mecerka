import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';

type ManualProviderOrderItem = {
  productId: string;
  quantity: number;
  priceAtPurchase: Prisma.Decimal;
  unitBasePriceSnapshot: Prisma.Decimal;
  discountPriceSnapshot: null;
};

type ManualProviderGroup = {
  items: ManualProviderOrderItem[];
  subtotal: number;
};

@Injectable()
export class LegacyManualOrderCreationService {
  private readonly logger = new Logger(LegacyManualOrderCreationService.name);

  constructor(private readonly prisma: PrismaService) {}

  private logStructuredEvent(
    event: string,
    payload: Record<string, string | number | boolean | null | undefined>,
    message: string,
  ) {
    this.logger.log(
      JSON.stringify({
        event,
        message,
        ...payload,
      }),
    );
  }

  async create(createOrderDto: CreateOrderDto, clientId: string) {
    const { items, deliveryAddress, pin, deliveryLat, deliveryLng } =
      createOrderDto;

    if (pin) {
      const user = await this.prisma.user.findUnique({
        where: { id: clientId },
      });
      if (!user) throw new NotFoundException('Usuario no encontrado');
      if (!user.pin) {
        throw new BadRequestException(
          'Debes configurar un PIN de compra en tu perfil.',
        );
      }
      const isPinValid = await argon2.verify(user.pin, pin);
      if (!isPinValid) {
        throw new UnauthorizedException('PIN de compra incorrecto.');
      }
    }

    const aggregatedItems: { productId: string; quantity: number }[] = [];
    const quantityMap = new Map<string, number>();
    for (const item of items) {
      quantityMap.set(
        item.productId,
        (quantityMap.get(item.productId) || 0) + item.quantity,
      );
    }
    quantityMap.forEach((qty, productId) => {
      aggregatedItems.push({ productId, quantity: qty });
    });

    const productIds = aggregatedItems.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        name: true,
        stock: true,
        isActive: true,
        cityId: true,
        price: true,
        providerId: true,
        provider: { select: { stripeAccountId: true } },
      },
    });

    if (products.length !== productIds.length) {
      const foundIds = new Set(products.map((p) => p.id));
      const missingIds = productIds.filter((id) => !foundIds.has(id));
      throw new NotFoundException(
        `Algunos productos no existen: ${missingIds.join(', ')}`,
      );
    }

    for (const product of products) {
      if (!product.isActive) {
        throw new BadRequestException(
          `El producto '${product.name}' ya no está disponible (inactivo)`,
        );
      }
      if (!product.provider.stripeAccountId) {
        throw new BadRequestException(
          `El producto '${product.name}' pertenece a un proveedor sin cuenta de pagos verificada. Compra no procesable por seguridad.`,
        );
      }
    }

    const distinctCityIds = new Set(products.map((p) => p.cityId));
    if (distinctCityIds.size > 1) {
      throw new BadRequestException(
        'No se puede mezclar productos de distintas ciudades en un mismo pedido',
      );
    }
    const cityId = distinctCityIds.values().next().value as string;

    for (const item of aggregatedItems) {
      const product = products.find((p) => p.id === item.productId)!;
      if (product.stock < item.quantity) {
        throw new BadRequestException(
          `Stock insuficiente para el producto '${product.name}' (Solicitado: ${item.quantity}, Disponible: ${product.stock})`,
        );
      }
    }

    const providerGroups: Record<string, ManualProviderGroup> = {};
    let orderTotalPrice = 0;

    for (const item of aggregatedItems) {
      const product = products.find((p) => p.id === item.productId)!;
      const providerId = product.providerId;
      const itemTotal = Number(product.price) * item.quantity;
      orderTotalPrice += itemTotal;
      if (!providerGroups[providerId]) {
        providerGroups[providerId] = { items: [], subtotal: 0 };
      }
      providerGroups[providerId].items.push({
        productId: product.id,
        quantity: item.quantity,
        priceAtPurchase: product.price,
        unitBasePriceSnapshot: product.price,
        discountPriceSnapshot: null,
      });
      providerGroups[providerId].subtotal += itemTotal;
    }

    if (Object.keys(providerGroups).length !== 1) {
      throw new BadRequestException(
        'El flujo de pago actual solo admite pedidos de un único proveedor.',
      );
    }

    const baseCityFee = 3.5;
    const multiStopPenalty = 1.5;
    const providerCount = Object.keys(providerGroups).length;
    const deliveryFee = baseCityFee + (providerCount - 1) * multiStopPenalty;

    const order = await this.prisma.order.create({
      data: {
        clientId,
        cityId,
        checkoutIdempotencyKey: `manual-order-${clientId}-${Date.now()}`,
        totalPrice: orderTotalPrice,
        deliveryFee,
        status: 'PENDING',
        deliveryAddress,
        deliveryLat,
        deliveryLng,
        providerOrders: {
          create: Object.entries(providerGroups).map(([providerId, group]) => ({
            providerId,
            status: 'PENDING',
            subtotalAmount: group.subtotal,
            paymentStatus: 'PENDING',
            items: { create: group.items },
          })),
        },
      },
      include: {
        providerOrders: { include: { items: true } },
      },
    });

    this.logStructuredEvent(
      'order.created',
      { orderId: order.id },
      'Order created through legacy manual flow',
    );

    return order;
  }
}
