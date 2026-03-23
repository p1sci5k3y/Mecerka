import {
  DeliveryOrderStatus,
  Prisma,
  PaymentSessionStatus,
  ProviderOrderStatus,
  ProviderPaymentStatus,
  RunnerPaymentStatus,
} from '@prisma/client';

type AggregateProviderPaymentStatusInput = {
  status: ProviderOrderStatus;
  paymentStatus: ProviderPaymentStatus;
};

type RunnerPaymentSessionSummaryInput = {
  status: PaymentSessionStatus;
};

type RunnerPaymentDeliveryOrderSummaryInput = {
  id: string;
  runnerId: string | null;
  currency: string | null;
  status: DeliveryOrderStatus;
  paymentStatus: RunnerPaymentStatus;
  paymentSessions: RunnerPaymentSessionSummaryInput[];
};

type RunnerPaymentOrderSummaryInput = {
  providerOrders: Array<unknown>;
  deliveryDistanceKm: Prisma.Decimal | number | null;
  runnerBaseFee: Prisma.Decimal | number | null;
  runnerPerKmFee: Prisma.Decimal | number | null;
  runnerExtraPickupFee: Prisma.Decimal | number | null;
  deliveryFee: Prisma.Decimal | number | null;
  deliveryOrder: RunnerPaymentDeliveryOrderSummaryInput | null;
};

type ProviderOrderDiscountSummaryItemInput = {
  quantity: number;
  priceAtPurchase: Prisma.Decimal | number;
  unitBasePriceSnapshot: Prisma.Decimal | number | null;
};

type ProviderOrderDiscountSummaryInput = {
  subtotalAmount: Prisma.Decimal | number;
  items: ProviderOrderDiscountSummaryItemInput[];
};

export class PaymentSummaryBuilder {
  private readonly sessionPreparedStatuses: PaymentSessionStatus[] = [
    PaymentSessionStatus.CREATED,
    PaymentSessionStatus.READY,
  ];

  private readonly runnerPaymentRequiredStatuses: DeliveryOrderStatus[] = [
    DeliveryOrderStatus.RUNNER_ASSIGNED,
    DeliveryOrderStatus.PICKUP_PENDING,
    DeliveryOrderStatus.PICKED_UP,
    DeliveryOrderStatus.IN_TRANSIT,
  ];

  buildAggregateProviderPaymentStatus(
    providerOrders: AggregateProviderPaymentStatusInput[],
  ) {
    const inactiveProviderStatuses = new Set<ProviderOrderStatus>([
      ProviderOrderStatus.REJECTED,
      ProviderOrderStatus.REJECTED_BY_STORE,
      ProviderOrderStatus.CANCELLED,
      ProviderOrderStatus.EXPIRED,
      ProviderOrderStatus.DELIVERED,
    ]);

    const payableProviderOrders = providerOrders.filter(
      (providerOrder) => !inactiveProviderStatuses.has(providerOrder.status),
    );

    if (payableProviderOrders.length === 0) {
      return {
        status: 'PAID',
        paidProviderOrders: 0,
        totalProviderOrders: 0,
      };
    }

    const paidProviderOrders = payableProviderOrders.filter(
      (providerOrder) =>
        providerOrder.paymentStatus === ProviderPaymentStatus.PAID,
    ).length;

    if (paidProviderOrders === 0) {
      return {
        status: 'UNPAID',
        paidProviderOrders,
        totalProviderOrders: payableProviderOrders.length,
      };
    }

    if (paidProviderOrders === payableProviderOrders.length) {
      return {
        status: 'PAID',
        paidProviderOrders,
        totalProviderOrders: payableProviderOrders.length,
      };
    }

    return {
      status: 'PARTIALLY_PAID',
      paidProviderOrders,
      totalProviderOrders: payableProviderOrders.length,
    };
  }

  buildRunnerPaymentSummary(order: RunnerPaymentOrderSummaryInput) {
    const deliveryOrder = order.deliveryOrder;
    const pickupCount = order.providerOrders.length;
    const additionalPickupCount = Math.max(pickupCount - 1, 0);
    const pricingDistanceKm =
      order.deliveryDistanceKm != null ? Number(order.deliveryDistanceKm) : 0;
    const baseFee =
      order.runnerBaseFee != null ? Number(order.runnerBaseFee) : 0;
    const perKmFee =
      order.runnerPerKmFee != null ? Number(order.runnerPerKmFee) : 0;
    const extraPickupFee =
      order.runnerExtraPickupFee != null
        ? Number(order.runnerExtraPickupFee)
        : 0;
    const distanceFee = this.roundMoney(pricingDistanceKm * perKmFee);
    const extraPickupCharge = this.roundMoney(
      additionalPickupCount * extraPickupFee,
    );
    const amount = order.deliveryFee != null ? Number(order.deliveryFee) : 0;
    const pricing = {
      amount: this.roundMoney(amount),
      currency: deliveryOrder?.currency ?? 'EUR',
      pricingDistanceKm: this.roundMoney(pricingDistanceKm),
      pickupCount,
      additionalPickupCount,
      baseFee: this.roundMoney(baseFee),
      perKmFee: this.roundMoney(perKmFee),
      distanceFee,
      extraPickupFee: this.roundMoney(extraPickupFee),
      extraPickupCharge,
    };

    if (!deliveryOrder) {
      return {
        paymentMode: 'DELIVERY_ORDER_SESSION',
        deliveryOrderId: null,
        runnerId: null,
        deliveryStatus: null,
        paymentStatus: 'NOT_CREATED',
        paymentRequired: false,
        sessionPrepared: false,
        ...pricing,
      };
    }

    const sessionPrepared = deliveryOrder.paymentSessions.some((session) =>
      this.sessionPreparedStatuses.includes(session.status),
    );
    const paymentRequired =
      Boolean(deliveryOrder.runnerId) &&
      deliveryOrder.paymentStatus !== RunnerPaymentStatus.PAID &&
      this.runnerPaymentRequiredStatuses.includes(deliveryOrder.status);

    return {
      paymentMode: 'DELIVERY_ORDER_SESSION',
      deliveryOrderId: deliveryOrder.id,
      runnerId: deliveryOrder.runnerId,
      deliveryStatus: deliveryOrder.status,
      paymentStatus: deliveryOrder.paymentStatus,
      paymentRequired,
      sessionPrepared,
      ...pricing,
    };
  }

  buildProviderOrderDiscountSummary(
    providerOrder: ProviderOrderDiscountSummaryInput,
  ) {
    const originalSubtotalAmount = this.roundMoney(
      providerOrder.items.reduce(
        (sum: number, item) =>
          sum +
          Number(item.unitBasePriceSnapshot ?? item.priceAtPurchase) *
            item.quantity,
        0,
      ),
    );
    const subtotalAmount = this.roundMoney(
      Number(providerOrder.subtotalAmount),
    );
    const discountAmount = this.roundMoney(
      Math.max(originalSubtotalAmount - subtotalAmount, 0),
    );

    return {
      originalSubtotalAmount,
      discountAmount,
    };
  }

  private roundMoney(value: number) {
    return Number(value.toFixed(2));
  }
}
