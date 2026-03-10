import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { PrismaService } from '../prisma/prisma.service';
import { Role, DeliveryStatus, ProviderOrderStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import {
  canTransitionOrder,
  canTransitionProviderOrder,
} from './utils/state-machine';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(createOrderDto: CreateOrderDto, clientId: string) {
    const { items, deliveryAddress, pin, deliveryLat, deliveryLng } =
      createOrderDto;

    // 0. Verify Transactional PIN (if provided)
    if (pin) {
      const user = await this.prisma.user.findUnique({
        where: { id: clientId },
      });
      if (!user) throw new NotFoundException('Usuario no encontrado');
      if (!user.pin)
        throw new BadRequestException(
          'Debes configurar un PIN de compra en tu perfil.',
        );
      const isPinValid = await argon2.verify(user.pin, pin);
      if (!isPinValid)
        throw new UnauthorizedException('PIN de compra incorrecto.');
    }

    // 1. Consolidate Duplicate Items in Memory
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

    // 2. Fetch products (Single Query without filtering active yet)
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

    // 3. Validation: Existence
    if (products.length !== productIds.length) {
      const foundIds = new Set(products.map((p) => p.id));
      const missingIds = productIds.filter((id) => !foundIds.has(id));
      throw new NotFoundException(
        `Algunos productos no existen: ${missingIds.join(', ')}`,
      );
    }

    // 4. Validation: Active Status & KYC Status
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

    // 5. Validation: Single City
    const distinctCityIds = new Set(products.map((p) => p.cityId));
    if (distinctCityIds.size > 1) {
      throw new BadRequestException(
        'No se puede mezclar productos de distintas ciudades en un mismo pedido',
      );
    }
    const cityId = distinctCityIds.values().next().value as string;

    // 6. Validation: Optimistic Stock Check
    for (const item of aggregatedItems) {
      const product = products.find((p) => p.id === item.productId)!;
      if (product.stock < item.quantity) {
        throw new BadRequestException(
          `Stock insuficiente para el producto '${product.name}' (Solicitado: ${item.quantity}, Disponible: ${product.stock})`,
        );
      }
    }

    // 7. Group by Provider payload using aggregated items
    const providerGroups: Record<string, { items: any[]; subtotal: number }> =
      {};
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
      });
      providerGroups[providerId].subtotal += itemTotal;
    }

    // 5. Calculate Logistics Economics dynamically on root payload
    const baseCityFee = 3.5; // Note: Fetch from config/DB map
    const multiStopPenalty = 1.5;
    const providerCount = Object.keys(providerGroups).length;
    const deliveryFee = baseCityFee + (providerCount - 1) * multiStopPenalty;

    // 6. Create Order and ProviderOrders (NO STOCK LOCK YET)
    const order = await this.prisma.order.create({
      data: {
        clientId,
        cityId,
        totalPrice: orderTotalPrice,
        deliveryFee,
        status: DeliveryStatus.PENDING,
        deliveryAddress,
        deliveryLat,
        deliveryLng,
        providerOrders: {
          create: Object.entries(providerGroups).map(([providerId, group]) => ({
            providerId,
            status: ProviderOrderStatus.PENDING,
            subtotal: group.subtotal,
            items: { create: group.items },
          })),
        },
      },
      include: {
        providerOrders: { include: { items: true } },
      },
    });

    return order;
  }

  findAll(userId: string, roles: Role[]) {
    if (roles.includes(Role.PROVIDER)) {
      return this.prisma.order.findMany({
        where: { providerOrders: { some: { providerId: userId } } },
        include: {
          providerOrders: {
            where: { providerId: userId },
            include: { items: { include: { product: true } } },
          },
          city: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    } else if (roles.includes(Role.RUNNER)) {
      return this.prisma.order.findMany({
        where: { runnerId: userId },
        include: {
          providerOrders: {
            include: { items: { include: { product: true } } },
          },
          city: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    } else if (roles.includes(Role.CLIENT)) {
      return this.prisma.order.findMany({
        where: { clientId: userId },
        include: {
          providerOrders: {
            include: { items: { include: { product: true } } },
          },
          city: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    }
    return [];
  }

  async findOne(id: string, userId: string, roles: Role[]) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        providerOrders: {
          include: { items: { include: { product: true } } },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }

    if (roles.includes(Role.ADMIN)) return order;

    const isClient = order.clientId === userId;
    const isRunner = order.runnerId === userId;
    const isProvider = order.providerOrders.some(
      (po) => po.providerId === userId,
    );

    if (!isClient && !isRunner && !isProvider) {
      throw new ForbiddenException(
        'You do not have permission to view this order',
      );
    }

    return order;
  }

  private async checkAndDecrementStock(
    tx: any,
    items: { productId: string; quantity: number }[],
  ): Promise<boolean> {
    const productIds = items.map((i) => i.productId);
    const products = await tx.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, stock: true, isActive: true },
    });
    const productMap = new Map(products.map((p: any) => [p.id, p]));

    for (const item of items) {
      const p: any = productMap.get(item.productId);
      if (!p?.isActive || p.stock < item.quantity) {
        return false;
      }
    }

    for (const item of items) {
      const res = await tx.product.updateMany({
        where: {
          id: item.productId,
          isActive: true,
          stock: { gte: item.quantity },
        },
        data: { stock: { decrement: item.quantity } },
      });

      if (res.count !== 1) {
        throw new ConflictException(
          'Concurrent stock update detected; retry payment confirmation',
        );
      }
    }

    return true;
  }

  private async evaluateProviderOrdersStock(
    tx: any,
    providerOrders: any[],
  ): Promise<{ rejected: string[]; confirmed: string[] }> {
    const rejected: string[] = [];
    const confirmed: string[] = [];

    for (const po of providerOrders) {
      if (
        po.status === ProviderOrderStatus.CANCELLED ||
        po.status === ProviderOrderStatus.REJECTED_BY_STORE
      ) {
        rejected.push(po.id);
        continue;
      }

      const providerOk = await this.checkAndDecrementStock(tx, po.items);

      if (providerOk) {
        confirmed.push(po.id);
      } else {
        rejected.push(po.id);
      }
    }

    return { rejected, confirmed };
  }

  async evaluateReadyForAssignment(orderId: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { providerOrders: true },
      });
      if (!order) return;
      if (order.status !== DeliveryStatus.CONFIRMED) return;

      const hasPendingOrPreparing = order.providerOrders.some((po) =>
        (
          [
            ProviderOrderStatus.PENDING,
            ProviderOrderStatus.ACCEPTED,
            ProviderOrderStatus.PREPARING,
          ] as ProviderOrderStatus[]
        ).includes(po.status),
      );

      const hasCancelledOrRejected = order.providerOrders.some((po) =>
        (
          [
            ProviderOrderStatus.REJECTED_BY_STORE,
            ProviderOrderStatus.CANCELLED,
          ] as ProviderOrderStatus[]
        ).includes(po.status),
      );

      if (hasPendingOrPreparing) {
        return; // Wait for other providers
      }

      if (hasCancelledOrRejected) {
        // Partial Fulfillment Scenario
        // The order remains in CONFIRMED state waiting for client decision
        return {
          event: 'order.partialCancelled',
          data: { orderId },
        };
      }

      // If all are READY_FOR_PICKUP (or PICKED_UP)
      if (
        !canTransitionOrder(order.status, DeliveryStatus.READY_FOR_ASSIGNMENT)
      ) {
        return; // Suppress and silently bypass illegal assignments
      }

      await tx.order.update({
        where: { id: orderId },
        data: { status: DeliveryStatus.READY_FOR_ASSIGNMENT },
      });

      // Event returned instead of emitted inside the transaction to prevent inconsistency
      return {
        event: 'order.stateChanged',
        data: { orderId, status: DeliveryStatus.READY_FOR_ASSIGNMENT },
      };
    });
  }

  async updateProviderOrderStatus(
    providerOrderId: string,
    userId: string,
    roles: Role[],
    status: ProviderOrderStatus,
  ) {
    const po = await this.prisma.providerOrder.findUnique({
      where: { id: providerOrderId },
      include: { order: true },
    });
    if (!po) throw new NotFoundException('ProviderOrder not found');

    const actingRole = this.getActingRole(po, userId, roles);

    if (!actingRole) {
      throw new ForbiddenException(
        'You do not have permission to update this provider order',
      );
    }

    if (!canTransitionProviderOrder(po.status, status, actingRole)) {
      throw new BadRequestException(
        `Illegal state transition from ${po.status} to ${status} for role ${actingRole}`,
      );
    }

    // Optimistic Concurrency Update
    const updated = await this.prisma.providerOrder.updateMany({
      where: { id: providerOrderId, status: po.status },
      data: { status },
    });

    if (updated.count === 0) {
      throw new ConflictException(
        'The order state has changed. Please refresh and try again.',
      );
    }

    // Propagate state upwards
    if (
      status === ProviderOrderStatus.READY_FOR_PICKUP ||
      status === ProviderOrderStatus.REJECTED_BY_STORE ||
      status === ProviderOrderStatus.CANCELLED
    ) {
      await this.evaluateReadyForAssignment(po.orderId);
    } else if (status === ProviderOrderStatus.PICKED_UP) {
      // Logic for all items picked up is already in `markInTransit` for the runner, but we should evaluate it
      // We can create a unified method later or check it here
      const order = await this.prisma.order.findUnique({
        where: { id: po.orderId },
        include: { providerOrders: true },
      });
      if (order?.status === DeliveryStatus.ASSIGNED) {
        const activeOrders = order.providerOrders.filter(
          (o) =>
            o.status !== ProviderOrderStatus.REJECTED_BY_STORE &&
            o.status !== ProviderOrderStatus.CANCELLED,
        );
        const allPickedUp = activeOrders.every(
          (o) => o.status === ProviderOrderStatus.PICKED_UP,
        );
        if (allPickedUp) {
          await this.prisma.order.update({
            where: { id: order.id },
            data: { status: DeliveryStatus.IN_TRANSIT },
          });
        }
      }
    }

    return this.prisma.providerOrder.findUnique({
      where: { id: providerOrderId },
    });
  }

  async getAvailableOrders() {
    return this.prisma.order.findMany({
      where: {
        status: DeliveryStatus.READY_FOR_ASSIGNMENT,
        runnerId: null,
      },
      include: {
        providerOrders: {
          include: { items: { include: { product: true } } },
        },
        city: true,
        client: {
          select: { name: true }, // Minimize data exposure
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async acceptOrder(id: string, runnerId: string) {
    const runner = await this.prisma.user.findUnique({
      where: { id: runnerId },
      select: { stripeAccountId: true },
    });
    if (!runner?.stripeAccountId) {
      throw new ForbiddenException(
        'Debes completar tu registro financiero en Stripe antes de aceptar pedidos.',
      );
    }

    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');
    if (!canTransitionOrder(order.status, DeliveryStatus.ASSIGNED)) {
      throw new BadRequestException('Order cannot transition to ASSIGNED');
    }

    const result = await this.prisma.order.updateMany({
      where: {
        id,
        status: DeliveryStatus.READY_FOR_ASSIGNMENT,
        runnerId: null,
        clientId: { not: runnerId },
      },
      data: {
        runnerId,
        status: DeliveryStatus.ASSIGNED,
      },
    });

    if (result.count === 0) {
      throw new BadRequestException(
        'Order is already accepted, cannot be assigned, or you are trying to deliver your own order',
      );
    }

    this.eventEmitter.emit('order.stateChanged', {
      orderId: id,
      status: DeliveryStatus.ASSIGNED,
    });

    return this.prisma.order.findUnique({ where: { id } });
  }

  async completeOrder(id: string, runnerId: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');
    if (!canTransitionOrder(order.status, DeliveryStatus.DELIVERED)) {
      throw new BadRequestException('Order cannot transition to DELIVERED');
    }

    // Note: Invariant Rule 2 verification
    // Must check if all sub-orders are PICKED_UP before delivering, or trust current DB status logic.

    const result = await this.prisma.order.updateMany({
      where: {
        id,
        runnerId,
        status: DeliveryStatus.IN_TRANSIT,
      },
      data: {
        status: DeliveryStatus.DELIVERED,
      },
    });

    if (result.count === 0) {
      throw new BadRequestException(
        'Order cannot be completed in its current state (Must be IN_TRANSIT), or you are not the assigned runner',
      );
    }

    this.eventEmitter.emit('order.stateChanged', {
      orderId: id,
      status: DeliveryStatus.DELIVERED,
    });

    return this.prisma.order.findUnique({ where: { id } });
  }

  async markInTransit(id: string, runnerId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { providerOrders: true },
    });

    if (!order) throw new NotFoundException('Order not found');

    if (order.runnerId !== runnerId) {
      throw new ForbiddenException(
        'You are not the assigned runner for this order',
      );
    }

    if (
      !canTransitionOrder(order.status, DeliveryStatus.IN_TRANSIT) ||
      order.status !== DeliveryStatus.ASSIGNED
    ) {
      throw new ConflictException(
        'Order must be in ASSIGNED state to mark as IN_TRANSIT',
      );
    }

    const activeProviderOrders = order.providerOrders.filter(
      (po) =>
        po.status !== ProviderOrderStatus.REJECTED_BY_STORE &&
        po.status !== ProviderOrderStatus.CANCELLED,
    );
    const allPickedUp =
      activeProviderOrders.length > 0 &&
      activeProviderOrders.every(
        (po) => po.status === ProviderOrderStatus.PICKED_UP,
      );

    if (!allPickedUp) {
      throw new ConflictException(
        'All active provider orders must be PICKED_UP before marking IN_TRANSIT',
      );
    }

    const updated = await this.prisma.order.update({
      where: { id },
      data: { status: DeliveryStatus.IN_TRANSIT },
    });

    this.eventEmitter.emit('order.stateChanged', {
      orderId: id,
      newStatus: updated.status,
      actorRole: Role.RUNNER,
      timestamp: new Date().toISOString(),
    });

    return updated;
  }

  async cancelOrder(id: string, userId: string, roles: Role[]) {
    const isAdmin = roles.includes(Role.ADMIN);
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { providerOrders: { include: { items: true } } },
    });

    if (!order) throw new NotFoundException('Order not found');

    if (!isAdmin) {
      if (order.clientId !== userId) {
        throw new ForbiddenException('You are not the client of this order');
      }

      const hasCancelledOrRejectedSubOrders = order.providerOrders.some((po) =>
        (
          [
            ProviderOrderStatus.REJECTED_BY_STORE,
            ProviderOrderStatus.CANCELLED,
          ] as ProviderOrderStatus[]
        ).includes(po.status),
      );

      if (order.status !== DeliveryStatus.PENDING) {
        if (
          order.status === DeliveryStatus.CONFIRMED &&
          hasCancelledOrRejectedSubOrders
        ) {
          // Allowed: The order is in partial fulfillment waiting state.
        } else {
          throw new ConflictException(
            'Clients can only cancel PENDING orders, or CONFIRMED orders with rejected items',
          );
        }
      }
    }

    if (!canTransitionOrder(order.status, DeliveryStatus.CANCELLED)) {
      throw new ConflictException('Illegal state transition to CANCELLED');
    }

    const providerOrderUpdateIds = order.providerOrders
      .filter(
        (po) =>
          po.status !== ProviderOrderStatus.REJECTED_BY_STORE &&
          po.status !== ProviderOrderStatus.CANCELLED,
      )
      .map((po) => po.id);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (providerOrderUpdateIds.length > 0) {
        // Restore inventory if we had confirmed the payment earlier
        if (
          order.status === DeliveryStatus.CONFIRMED ||
          order.status === DeliveryStatus.READY_FOR_ASSIGNMENT ||
          order.status === DeliveryStatus.ASSIGNED
        ) {
          for (const po of order.providerOrders) {
            if (providerOrderUpdateIds.includes(po.id)) {
              for (const item of po.items) {
                await tx.product.update({
                  where: { id: item.productId },
                  data: { stock: { increment: item.quantity } },
                });
              }
            }
          }
        }

        await tx.providerOrder.updateMany({
          where: { id: { in: providerOrderUpdateIds } },
          data: { status: ProviderOrderStatus.CANCELLED },
        });
      }

      return tx.order.update({
        where: { id },
        data: { status: DeliveryStatus.CANCELLED },
        include: { providerOrders: { include: { items: true } } },
      });
    });

    this.eventEmitter.emit('order.stateChanged', {
      orderId: id,
      newStatus: updated.status,
      actorRole: isAdmin ? Role.ADMIN : Role.CLIENT,
      timestamp: new Date().toISOString(),
    });

    return updated;
  }

  async getProviderStats(providerId: string) {
    const providerOrders = await this.prisma.providerOrder.findMany({
      where: {
        providerId,
        status: {
          in: [
            ProviderOrderStatus.ACCEPTED,
            ProviderOrderStatus.PREPARING,
            ProviderOrderStatus.READY_FOR_PICKUP,
            ProviderOrderStatus.PICKED_UP,
          ],
        },
      },
      include: {
        items: true,
      },
    });

    const totalRevenue = providerOrders.reduce((sum, po) => {
      const poTotal = po.items.reduce(
        (acc, item) => acc + Number(item.priceAtPurchase) * item.quantity,
        0,
      );
      return sum + poTotal;
    }, 0);

    const totalOrders = providerOrders.length;
    const itemsSold = providerOrders.reduce((sum, po) => {
      return sum + po.items.reduce((acc, item) => acc + item.quantity, 0);
    }, 0);

    const averageTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    return {
      totalRevenue,
      totalOrders,
      itemsSold,
      averageTicket,
    };
  }

  async getProviderSalesChart(providerId: string) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const providerOrders = await this.prisma.providerOrder.findMany({
      where: {
        providerId,
        createdAt: { gte: thirtyDaysAgo },
        status: {
          in: [
            ProviderOrderStatus.ACCEPTED,
            ProviderOrderStatus.PREPARING,
            ProviderOrderStatus.READY_FOR_PICKUP,
            ProviderOrderStatus.PICKED_UP,
          ],
        },
      },
      include: {
        items: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const salesByDate: Record<string, number> = {};

    providerOrders.forEach((po) => {
      const date = po.createdAt.toISOString().split('T')[0];
      const poTotal = po.items.reduce(
        (acc, item) => acc + Number(item.priceAtPurchase) * item.quantity,
        0,
      );
      salesByDate[date] = (salesByDate[date] || 0) + poTotal;
    });

    return Object.entries(salesByDate).map(([date, amount]) => ({
      date,
      amount,
    }));
  }

  async getProviderTopProducts(providerId: string) {
    const providerOrders = await this.prisma.providerOrder.findMany({
      where: {
        providerId,
        status: {
          in: [
            ProviderOrderStatus.ACCEPTED,
            ProviderOrderStatus.PREPARING,
            ProviderOrderStatus.READY_FOR_PICKUP,
            ProviderOrderStatus.PICKED_UP,
          ],
        },
      },
      include: {
        items: { include: { product: true } },
      },
    });

    const productStats = new Map<
      string,
      { name: string; revenue: number; quantity: number }
    >();

    providerOrders.forEach((po) => {
      po.items.forEach((item) => {
        if (!productStats.has(item.productId)) {
          productStats.set(item.productId, {
            name: item.product.name,
            revenue: 0,
            quantity: 0,
          });
        }
        const stat = productStats.get(item.productId)!;
        stat.revenue += Number(item.priceAtPurchase) * item.quantity;
        stat.quantity += item.quantity;
      });
    });

    return Array.from(productStats.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }

  private getActingRole(po: any, userId: string, roles: Role[]): Role | null {
    if (roles.includes(Role.ADMIN)) return Role.ADMIN;
    if (po.order.runnerId === userId && roles.includes(Role.RUNNER))
      return Role.RUNNER;
    if (po.providerId === userId && roles.includes(Role.PROVIDER))
      return Role.PROVIDER;
    if (po.order.clientId === userId && roles.includes(Role.CLIENT))
      return Role.CLIENT;
    return null;
  }
}
