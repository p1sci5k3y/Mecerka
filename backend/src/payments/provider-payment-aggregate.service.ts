import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PaymentSessionStatus,
  ProviderOrderStatus,
  ProviderPaymentStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentSummaryBuilder } from './payment-summary.builder';

type PreparedProviderOrderPayment = {
  providerOrderId: string;
  paymentSessionId: string;
  stripeAccountId: string | null;
  expiresAt: Date | null;
  paymentStatus: ProviderPaymentStatus;
  externalSessionId?: string | null;
  clientSecret?: string | null;
};

export class ProviderPaymentAggregateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly summaryBuilder: PaymentSummaryBuilder,
    private readonly demoProviderPaymentUnavailableMessage: string,
  ) {}

  async prepareOrderProviderPayments(
    orderId: string,
    clientId: string,
    prepareProviderOrderPayment: (
      providerOrderId: string,
      clientId: string,
    ) => Promise<PreparedProviderOrderPayment>,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        providerOrders: {
          orderBy: { createdAt: 'asc' },
          include: {
            provider: {
              select: {
                name: true,
              },
            },
            items: {
              select: {
                quantity: true,
                priceAtPurchase: true,
                unitBasePriceSnapshot: true,
              },
            },
          },
        },
        deliveryOrder: {
          include: {
            paymentSessions: {
              where: {
                status: {
                  in: [
                    PaymentSessionStatus.CREATED,
                    PaymentSessionStatus.READY,
                  ],
                },
              },
            },
          },
        },
      },
    });

    if (!order || order.clientId !== clientId) {
      throw new NotFoundException('Order not found or not owned by client');
    }

    if (order.providerOrders.length === 0) {
      throw new ConflictException('Order has no provider items');
    }

    const aggregateProviderPayment =
      this.summaryBuilder.buildAggregateProviderPaymentStatus(
        order.providerOrders,
      );
    const paymentsUnavailable = this.isDemoStripeCheckoutUnavailable();

    const providerOrders = [];
    const inactiveProviderStatuses = new Set<ProviderOrderStatus>([
      ProviderOrderStatus.REJECTED,
      ProviderOrderStatus.REJECTED_BY_STORE,
      ProviderOrderStatus.CANCELLED,
      ProviderOrderStatus.EXPIRED,
      ProviderOrderStatus.DELIVERED,
    ]);

    for (const providerOrder of order.providerOrders) {
      const isSettled =
        providerOrder.paymentStatus === ProviderPaymentStatus.PAID;
      const isInactive = inactiveProviderStatuses.has(providerOrder.status);
      const pricing =
        this.summaryBuilder.buildProviderOrderDiscountSummary(providerOrder);

      if (isSettled || isInactive) {
        providerOrders.push({
          providerOrderId: providerOrder.id,
          providerId: providerOrder.providerId,
          providerName: providerOrder.provider.name,
          subtotalAmount: providerOrder.subtotalAmount,
          originalSubtotalAmount: pricing.originalSubtotalAmount,
          discountAmount: pricing.discountAmount,
          status: providerOrder.status,
          paymentStatus: providerOrder.paymentStatus,
          paymentRequired: false,
          paymentSession: null,
        });
        continue;
      }

      if (paymentsUnavailable) {
        providerOrders.push({
          providerOrderId: providerOrder.id,
          providerId: providerOrder.providerId,
          providerName: providerOrder.provider.name,
          subtotalAmount: providerOrder.subtotalAmount,
          originalSubtotalAmount: pricing.originalSubtotalAmount,
          discountAmount: pricing.discountAmount,
          status: providerOrder.status,
          paymentStatus: providerOrder.paymentStatus,
          paymentRequired: true,
          paymentSession: null,
        });
        continue;
      }

      const session = await prepareProviderOrderPayment(
        providerOrder.id,
        clientId,
      );

      providerOrders.push({
        providerOrderId: providerOrder.id,
        providerId: providerOrder.providerId,
        providerName: providerOrder.provider.name,
        subtotalAmount: providerOrder.subtotalAmount,
        originalSubtotalAmount: pricing.originalSubtotalAmount,
        discountAmount: pricing.discountAmount,
        status: ProviderOrderStatus.PAYMENT_READY,
        paymentStatus: session.paymentStatus,
        paymentRequired: true,
        paymentSession: session,
      });
    }

    return {
      orderId: order.id,
      orderStatus: order.status,
      paymentMode: 'PROVIDER_ORDER_SESSIONS',
      paymentEnvironment: paymentsUnavailable ? 'UNAVAILABLE' : 'READY',
      paymentEnvironmentMessage: paymentsUnavailable
        ? this.demoProviderPaymentUnavailableMessage
        : null,
      providerPaymentStatus: aggregateProviderPayment.status,
      paidProviderOrders: aggregateProviderPayment.paidProviderOrders,
      totalProviderOrders: aggregateProviderPayment.totalProviderOrders,
      providerOrders,
      runnerPayment: this.summaryBuilder.buildRunnerPaymentSummary(order),
    };
  }

  private isDemoStripeCheckoutUnavailable() {
    const demoMode = this.configService.get<string>('DEMO_MODE') === 'true';
    const stripeSecretKey =
      this.configService.get<string>('STRIPE_SECRET_KEY')?.trim() ?? '';

    return demoMode && (!stripeSecretKey || stripeSecretKey.includes('dummy'));
  }
}
