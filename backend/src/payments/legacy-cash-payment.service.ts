import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DeliveryStatus, Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';

type CashPaymentItem = {
  productId: string;
  quantity: number;
  priceAtPurchase: Prisma.Decimal | number | string;
};

type StockSnapshot = {
  id: string;
  stock: number;
};

export class LegacyCashPaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async processCashPayment(orderId: string, clientId: string, pin: string) {
    if (
      this.configService.get<string>('ENABLE_LEGACY_CASH_PAYMENTS') !== 'true'
    ) {
      throw new ConflictException(
        'Legacy cash payments are disabled. Use provider payment sessions instead.',
      );
    }

    if (!pin) {
      throw new BadRequestException(
        'El PIN es requerido para pagos en efectivo',
      );
    }

    const user = await this.prisma.user.findUnique({ where: { id: clientId } });
    if (!user?.pin) {
      throw new BadRequestException('Debes configurar un PIN transaccional.');
    }

    const isPinValid = await argon2.verify(user.pin, pin);
    if (!isPinValid) {
      throw new UnauthorizedException('PIN de compra incorrecto.');
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId, clientId },
      include: {
        providerOrders: {
          include: {
            items: true,
          },
        },
      },
    });

    if (!order || order.status !== DeliveryStatus.PENDING) {
      throw new NotFoundException('Order not found or not in PENDING state');
    }

    if (order.providerOrders.length !== 1) {
      throw new ConflictException(
        'El flujo de pago actual solo admite pedidos de un único proveedor.',
      );
    }

    const providerOrder = order.providerOrders[0];
    if (!providerOrder) {
      throw new ConflictException('Order has no provider items');
    }

    const productsTotalCents = providerOrder.items.reduce(
      (acc, item) =>
        acc + Math.round(Number(item.priceAtPurchase) * 100) * item.quantity,
      0,
    );
    const totalLogisticsCents = 600;
    const clientLogisticsBurdenCents = totalLogisticsCents / 2;
    const providerLogisticsBurdenCents = totalLogisticsCents / 2;
    const finalChargeToClientCents =
      productsTotalCents + clientLogisticsBurdenCents;

    const paymentRef = `CASH_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    await this.prisma.$transaction(async (tx) => {
      const providerHasStock = await this.attemptStockDeduction(
        tx,
        providerOrder.items,
      );
      if (!providerHasStock) {
        throw new ConflictException(
          'Out of stock items during cash order processing',
        );
      }

      await tx.order.update({
        where: { id: order.id },
        data: {
          status: DeliveryStatus.CONFIRMED,
          paymentRef,
          confirmedAt: new Date(),
        },
      });
    });

    this.eventEmitter.emit('order.stateChanged', {
      orderId: order.id,
      status: DeliveryStatus.CONFIRMED,
      paymentRef,
    });

    return {
      method: 'CASH',
      success: true,
      breakdown: {
        totalCharge: finalChargeToClientCents / 100,
        logisticsDebtClient: clientLogisticsBurdenCents / 100,
        logisticsDebtProvider: providerLogisticsBurdenCents / 100,
      },
    };
  }

  private async attemptStockDeduction(
    tx: Prisma.TransactionClient,
    items: CashPaymentItem[],
  ): Promise<boolean> {
    const productIds = items.map((item) => item.productId);
    const products = await tx.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, stock: true },
    });
    const productMap = new Map<string, StockSnapshot>(
      products.map((product) => [product.id, product]),
    );

    for (const item of items) {
      const product = productMap.get(item.productId);
      if (!product || product.stock < item.quantity) {
        return false;
      }
    }

    for (const item of items) {
      await tx.product.updateMany({
        where: {
          id: item.productId,
          stock: { gte: item.quantity },
        },
        data: {
          stock: { decrement: item.quantity },
        },
      });
    }

    return true;
  }
}
