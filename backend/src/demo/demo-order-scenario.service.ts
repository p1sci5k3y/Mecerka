import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DeliveryIncidentStatus,
  DeliveryIncidentType,
  IncidentReporterRole,
  RefundStatus,
  RefundType,
  Role,
} from '@prisma/client';
import { CartService } from '../cart/cart.service';
import { DeliveryService } from '../delivery/delivery.service';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { DEMO_ORDER_SCENARIOS } from './demo.seed-data';

export type DemoSeededProduct = {
  id: string;
  name: string;
  cityId: string;
  citySlug?: string;
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

  private async seedSupportArtifacts(orderId: string, reporterId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        providerOrders: {
          select: {
            id: true,
          },
        },
        deliveryOrder: {
          select: {
            id: true,
          },
        },
      },
    });

    const providerOrderId = order?.providerOrders[0]?.id;
    const deliveryOrderId = order?.deliveryOrder?.id;

    if (!providerOrderId || !deliveryOrderId) {
      throw new ConflictException(
        'Demo support seeding requires a provider order and a delivery order',
      );
    }

    const incident = await this.prisma.deliveryIncident.create({
      data: {
        deliveryOrderId,
        reporterId,
        reporterRole: IncidentReporterRole.CLIENT,
        type: DeliveryIncidentType.DAMAGED_ITEMS,
        status: DeliveryIncidentStatus.OPEN,
        description:
          'Caso demo para validar soporte postpedido en provider, runner y admin.',
        evidenceUrl: 'https://demo.mecerka.me/evidence/support-demo-photo.jpg',
      },
    });

    await this.prisma.refundRequest.create({
      data: {
        incidentId: incident.id,
        providerOrderId,
        type: RefundType.PROVIDER_PARTIAL,
        status: RefundStatus.UNDER_REVIEW,
        amount: 2.5,
        currency: 'EUR',
        requestedById: reporterId,
      },
    });

    await this.prisma.refundRequest.create({
      data: {
        incidentId: incident.id,
        deliveryOrderId,
        type: RefundType.DELIVERY_PARTIAL,
        status: RefundStatus.REQUESTED,
        amount: 1.5,
        currency: 'EUR',
        requestedById: reporterId,
      },
    });
  }

  async createDemoOrders(products: DemoSeededProduct[]) {
    const productsByName = new Map<string, DemoSeededProduct>(
      products.map((product) => [product.name, product]),
    );
    const cityIdsBySlug = new Map<string, string>();
    for (const product of products) {
      if (product.citySlug && !cityIdsBySlug.has(product.citySlug)) {
        cityIdsBySlug.set(product.citySlug, product.cityId);
      }
    }
    const requireDemoProduct = (name: string) => {
      const product = productsByName.get(name);
      if (!product) {
        throw new ConflictException(`Missing demo product '${name}'`);
      }
      return product;
    };
    if (cityIdsBySlug.size === 0) {
      throw new ConflictException('Demo products are missing city mappings');
    }

    const orders = [];

    for (const scenario of DEMO_ORDER_SCENARIOS) {
      const cityId = cityIdsBySlug.get(scenario.citySlug);
      if (!cityId) {
        throw new ConflictException(
          `Missing demo city '${scenario.citySlug}' for scenario '${scenario.key}'`,
        );
      }

      const client = await this.findUserByEmail(scenario.clientEmail);
      const order = await this.createCheckoutOrder(
        client.id,
        scenario.items.map((item) => ({
          productId: requireDemoProduct(item.productName).id,
          quantity: item.quantity,
        })),
        `demo-${scenario.key}`,
        cityId,
        scenario.deliveryAddress,
        scenario.postalCode,
        scenario.addressReference,
      );

      if (scenario.lifecycle === 'PENDING') {
        orders.push(order);
        continue;
      }

      await this.confirmDemoProviderOrderPayment(order.id);
      const delivery = await this.deliveryService.createDeliveryOrder(
        {
          orderId: order.id,
          deliveryFee: Number(order.deliveryFee ?? 0),
          currency: 'EUR',
        },
        client.id,
        [Role.CLIENT],
      );

      const runnerEmail = scenario.runnerEmail;
      if (!runnerEmail) {
        throw new ConflictException(
          `Scenario '${scenario.key}' requires a runnerEmail`,
        );
      }

      const runner = await this.findUserByEmail(runnerEmail);
      await this.deliveryService.assignRunner(
        delivery.id,
        { runnerId: runner.id },
        client.id,
        [Role.CLIENT],
      );

      if (scenario.lifecycle === 'ASSIGNED') {
        orders.push(order);
        continue;
      }

      await this.deliveryService.markPickupPending(delivery.id, runner.id, [
        Role.RUNNER,
      ]);
      await this.deliveryService.confirmPickup(delivery.id, runner.id, [
        Role.RUNNER,
      ]);
      await this.deliveryService.startTransit(delivery.id, runner.id, [
        Role.RUNNER,
      ]);

      if (scenario.location) {
        await this.deliveryService.updateRunnerLocation(
          delivery.id,
          runner.id,
          [Role.RUNNER],
          scenario.location,
        );
      }

      if (scenario.lifecycle === 'DELIVERED') {
        await this.deliveryService.confirmDelivery(
          delivery.id,
          runner.id,
          [Role.RUNNER],
          {
            deliveryNotes: scenario.deliveryNotes ?? 'Entrega demo completada',
          },
        );
      }

      if (scenario.lifecycle === 'SUPPORT') {
        await this.seedSupportArtifacts(order.id, client.id);
      }

      orders.push(order);
    }

    return orders;
  }
}
