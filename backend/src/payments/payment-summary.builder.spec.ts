import {
  DeliveryOrderStatus,
  PaymentSessionStatus,
  ProviderOrderStatus,
  ProviderPaymentStatus,
  RunnerPaymentStatus,
} from '@prisma/client';
import { PaymentSummaryBuilder } from './payment-summary.builder';

describe('PaymentSummaryBuilder', () => {
  const builder = new PaymentSummaryBuilder();

  it('returns PARTIALLY_PAID when only some payable provider orders are paid', () => {
    const summary = builder.buildAggregateProviderPaymentStatus([
      {
        status: ProviderOrderStatus.PAYMENT_READY,
        paymentStatus: ProviderPaymentStatus.PAID,
      },
      {
        status: ProviderOrderStatus.PAYMENT_READY,
        paymentStatus: ProviderPaymentStatus.PENDING,
      },
    ]);

    expect(summary).toEqual({
      status: 'PARTIALLY_PAID',
      paidProviderOrders: 1,
      totalProviderOrders: 2,
    });
  });

  it('returns PAID when there are no payable provider orders', () => {
    const summary = builder.buildAggregateProviderPaymentStatus([
      {
        status: ProviderOrderStatus.CANCELLED,
        paymentStatus: ProviderPaymentStatus.PENDING,
      },
      {
        status: ProviderOrderStatus.DELIVERED,
        paymentStatus: ProviderPaymentStatus.PAID,
      },
    ]);

    expect(summary).toEqual({
      status: 'PAID',
      paidProviderOrders: 0,
      totalProviderOrders: 0,
    });
  });

  it('returns UNPAID when payable provider orders exist but none are paid', () => {
    const summary = builder.buildAggregateProviderPaymentStatus([
      {
        status: ProviderOrderStatus.PAYMENT_READY,
        paymentStatus: ProviderPaymentStatus.PENDING,
      },
    ]);

    expect(summary).toEqual({
      status: 'UNPAID',
      paidProviderOrders: 0,
      totalProviderOrders: 1,
    });
  });

  it('builds runner pricing summary from the persisted order snapshot', () => {
    const summary = builder.buildRunnerPaymentSummary({
      providerOrders: [{}, {}],
      deliveryDistanceKm: 3.456,
      runnerBaseFee: 3.5,
      runnerPerKmFee: 0.9,
      runnerExtraPickupFee: 1.5,
      deliveryFee: 8.11,
      deliveryOrder: {
        id: 'delivery-1',
        runnerId: 'runner-1',
        currency: 'EUR',
        paymentStatus: RunnerPaymentStatus.PENDING,
        status: DeliveryOrderStatus.RUNNER_ASSIGNED,
        paymentSessions: [{ status: PaymentSessionStatus.READY }],
      },
    });

    expect(summary).toMatchObject({
      deliveryOrderId: 'delivery-1',
      paymentRequired: true,
      sessionPrepared: true,
      pickupCount: 2,
      additionalPickupCount: 1,
      pricingDistanceKm: 3.46,
      baseFee: 3.5,
      perKmFee: 0.9,
      extraPickupFee: 1.5,
    });
  });

  it('builds a NOT_CREATED runner payment summary when no delivery order exists', () => {
    const summary = builder.buildRunnerPaymentSummary({
      providerOrders: [{}],
      deliveryDistanceKm: null,
      runnerBaseFee: null,
      runnerPerKmFee: null,
      runnerExtraPickupFee: null,
      deliveryFee: null,
      deliveryOrder: null,
    });

    expect(summary).toMatchObject({
      deliveryOrderId: null,
      runnerId: null,
      deliveryStatus: null,
      paymentStatus: 'NOT_CREATED',
      paymentRequired: false,
      sessionPrepared: false,
      amount: 0,
      currency: 'EUR',
    });
  });

  it('marks runner payments as not required when already paid or no runner is assigned', () => {
    const paidSummary = builder.buildRunnerPaymentSummary({
      providerOrders: [{}, {}],
      deliveryDistanceKm: 1,
      runnerBaseFee: 2,
      runnerPerKmFee: 1,
      runnerExtraPickupFee: 0.5,
      deliveryFee: 3,
      deliveryOrder: {
        id: 'delivery-1',
        runnerId: 'runner-1',
        currency: null,
        paymentStatus: RunnerPaymentStatus.PAID,
        status: DeliveryOrderStatus.IN_TRANSIT,
        paymentSessions: [{ status: PaymentSessionStatus.FAILED }],
      },
    });
    const unassignedSummary = builder.buildRunnerPaymentSummary({
      providerOrders: [{}],
      deliveryDistanceKm: 1,
      runnerBaseFee: 2,
      runnerPerKmFee: 1,
      runnerExtraPickupFee: 0.5,
      deliveryFee: 3,
      deliveryOrder: {
        id: 'delivery-2',
        runnerId: null,
        currency: 'EUR',
        paymentStatus: RunnerPaymentStatus.PENDING,
        status: DeliveryOrderStatus.RUNNER_ASSIGNED,
        paymentSessions: [],
      },
    });

    expect(paidSummary.paymentRequired).toBe(false);
    expect(paidSummary.sessionPrepared).toBe(false);
    expect(paidSummary.currency).toBe('EUR');
    expect(unassignedSummary.paymentRequired).toBe(false);
  });

  it('builds provider order discount summaries using fallback prices and zero floors', () => {
    expect(
      builder.buildProviderOrderDiscountSummary({
        subtotalAmount: 8,
        items: [
          {
            quantity: 2,
            priceAtPurchase: 5,
            unitBasePriceSnapshot: null,
          },
        ],
      }),
    ).toEqual({
      originalSubtotalAmount: 10,
      discountAmount: 2,
    });

    expect(
      builder.buildProviderOrderDiscountSummary({
        subtotalAmount: 12,
        items: [
          {
            quantity: 2,
            priceAtPurchase: 5,
            unitBasePriceSnapshot: 5,
          },
        ],
      }),
    ).toEqual({
      originalSubtotalAmount: 10,
      discountAmount: 0,
    });
  });
});
