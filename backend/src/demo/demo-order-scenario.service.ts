import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CartService } from '../cart/cart.service';
import { DeliveryService } from '../delivery/delivery.service';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';

export type DemoSeededProduct = {
  id: string;
  name: string;
  cityId: string;
};

@Injectable()
export class DemoOrderScenarioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cartService: CartService,
    private readonly ordersService: OrdersService,
    private readonly deliveryService: DeliveryService,
    private readonly paymentsService: PaymentsService,
  ) {}

  private async findUserByEmail(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        roles: true,
        verificationToken: true,
        stripeAccountId: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`Demo user ${email} was not created`);
    }

    return user;
  }

  private async createCheckoutOrder(
    clientId: string,
    items: Array<{ productId: string; quantity: number }>,
    idempotencyKey: string,
    cityId: string,
    deliveryAddress: string,
    postalCode: string,
    addressReference?: string,
  ) {
    for (const item of items) {
      await this.cartService.addItem(clientId, item);
    }

    return this.ordersService.checkoutFromCart(
      clientId,
      {
        cityId,
        deliveryAddress,
        postalCode,
        addressReference,
        discoveryRadiusKm: 8,
      },
      idempotencyKey,
    );
  }

  private async confirmDemoProviderOrderPayment(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        providerOrders: true,
      },
    });

    if (!order || order.providerOrders.length !== 1) {
      throw new ConflictException(
        'Demo payment confirmation requires a single-provider order',
      );
    }

    const providerOrder = order.providerOrders[0];
    if (!providerOrder) {
      throw new NotFoundException('ProviderOrder not found');
    }

    const session = await this.ordersService.prepareProviderOrderPayment(
      providerOrder.id,
    );
    const externalSessionId = `demo_pi_${providerOrder.id.replace(/-/g, '').slice(0, 24)}`;

    await this.prisma.providerPaymentSession.update({
      where: { id: session.id },
      data: {
        externalSessionId,
      },
    });

    await this.prisma.providerOrder.update({
      where: { id: providerOrder.id },
      data: {
        paymentRef: externalSessionId,
      },
    });

    const provider = await this.prisma.user.findUnique({
      where: { id: providerOrder.providerId },
      select: {
        stripeAccountId: true,
      },
    });

    if (!provider?.stripeAccountId) {
      throw new ConflictException(
        'Demo provider is missing a connected account bootstrap value',
      );
    }

    return this.paymentsService.confirmProviderOrderPayment(
      externalSessionId,
      `demo_evt_${providerOrder.id.replace(/-/g, '')}`,
      'payment_intent.succeeded',
      {
        amount: Math.round(Number(providerOrder.subtotalAmount) * 100),
        amountReceived: Math.round(Number(providerOrder.subtotalAmount) * 100),
        currency: 'eur',
        accountId: provider.stripeAccountId,
        metadata: {
          orderId,
          providerOrderId: providerOrder.id,
          providerPaymentSessionId: session.id,
        },
      },
    );
  }

  async createDemoOrders(products: DemoSeededProduct[]) {
    const productsByName = new Map<string, DemoSeededProduct>(
      products.map((product) => [product.name, product]),
    );
    const requireDemoProduct = (name: string) => {
      const product = productsByName.get(name);
      if (!product) {
        throw new ConflictException(`Missing demo product '${name}'`);
      }
      return product;
    };
    const cityId = products[0]?.cityId;
    if (!cityId) {
      throw new ConflictException('Demo products are missing a cityId');
    }
    const user1 = await this.findUserByEmail('user.demo@local.test');
    const user2 = await this.findUserByEmail('user2.demo@local.test');
    const runner1 = await this.findUserByEmail('runner.demo@local.test');
    const runner2 = await this.findUserByEmail('runner2.demo@local.test');

    const pendingOrder = await this.createCheckoutOrder(
      user1.id,
      [
        {
          productId: requireDemoProduct('Pan artesano').id,
          quantity: 2,
        },
        {
          productId: requireDemoProduct('Empanada gallega').id,
          quantity: 1,
        },
      ],
      'demo-pending-order',
      cityId,
      'Calle Hombre de Palo, 7',
      '45001',
      'Portal azul',
    );

    const deliveringOrder = await this.createCheckoutOrder(
      user1.id,
      [
        {
          productId: requireDemoProduct('Tomates ecológicos').id,
          quantity: 3,
        },
        {
          productId: requireDemoProduct('Huevos camperos').id,
          quantity: 1,
        },
      ],
      'demo-delivering-order',
      cityId,
      'Calle Sixto Ramon Parro, 9',
      '45001',
    );
    await this.confirmDemoProviderOrderPayment(deliveringOrder.id);
    const deliveringDelivery = await this.deliveryService.createDeliveryOrder(
      {
        orderId: deliveringOrder.id,
        deliveryFee: Number(deliveringOrder.deliveryFee ?? 0),
        currency: 'EUR',
      },
      user1.id,
      [Role.CLIENT],
    );
    await this.deliveryService.assignRunner(
      deliveringDelivery.id,
      { runnerId: runner1.id },
      user1.id,
      [Role.CLIENT],
    );
    await this.deliveryService.markPickupPending(
      deliveringDelivery.id,
      runner1.id,
      [Role.RUNNER],
    );
    await this.deliveryService.confirmPickup(
      deliveringDelivery.id,
      runner1.id,
      [Role.RUNNER],
    );
    await this.deliveryService.startTransit(deliveringDelivery.id, runner1.id, [
      Role.RUNNER,
    ]);
    await this.deliveryService.updateRunnerLocation(
      deliveringDelivery.id,
      runner1.id,
      [Role.RUNNER],
      {
        latitude: 40.417,
        longitude: -3.703,
      },
    );

    const deliveredOrder = await this.createCheckoutOrder(
      user2.id,
      [
        {
          productId: requireDemoProduct('Queso manchego').id,
          quantity: 1,
        },
        {
          productId: requireDemoProduct('Aceite de oliva').id,
          quantity: 1,
        },
      ],
      'demo-delivered-order',
      cityId,
      'Cuesta Carlos V, 3',
      '45001',
    );
    await this.confirmDemoProviderOrderPayment(deliveredOrder.id);
    const deliveredDelivery = await this.deliveryService.createDeliveryOrder(
      {
        orderId: deliveredOrder.id,
        deliveryFee: Number(deliveredOrder.deliveryFee ?? 0),
        currency: 'EUR',
      },
      user2.id,
      [Role.CLIENT],
    );
    await this.deliveryService.assignRunner(
      deliveredDelivery.id,
      { runnerId: runner2.id },
      user2.id,
      [Role.CLIENT],
    );
    await this.deliveryService.markPickupPending(
      deliveredDelivery.id,
      runner2.id,
      [Role.RUNNER],
    );
    await this.deliveryService.confirmPickup(deliveredDelivery.id, runner2.id, [
      Role.RUNNER,
    ]);
    await this.deliveryService.startTransit(deliveredDelivery.id, runner2.id, [
      Role.RUNNER,
    ]);
    await this.deliveryService.updateRunnerLocation(
      deliveredDelivery.id,
      runner2.id,
      [Role.RUNNER],
      {
        latitude: 40.418,
        longitude: -3.702,
      },
    );
    await this.deliveryService.confirmDelivery(
      deliveredDelivery.id,
      runner2.id,
      [Role.RUNNER],
      {
        deliveryNotes: 'Entrega demo completada',
      },
    );

    return [pendingOrder, deliveringOrder, deliveredOrder];
  }
}
