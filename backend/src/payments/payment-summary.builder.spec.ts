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
});
