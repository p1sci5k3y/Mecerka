import { beforeEach, describe, expect, it, vi } from "vitest"
import { paymentsService } from "@/lib/services/payments-service"

const apiPostMock = vi.fn()

vi.mock("@/lib/api", () => ({
  api: {
    post: (...args: unknown[]) => apiPostMock(...args),
  },
}))

describe("payments-service", () => {
  beforeEach(() => {
    apiPostMock.mockReset()
  })

  it("normalizes provider and runner payment aggregates", async () => {
    apiPostMock.mockResolvedValueOnce({
      orderId: "55",
      orderStatus: "PENDING",
      paymentMode: "PROVIDER_ORDER_SESSIONS",
      providerPaymentStatus: "PARTIALLY_PAID",
      paidProviderOrders: 1,
      totalProviderOrders: 2,
      providerOrders: [
        {
          providerOrderId: "po-1",
          providerId: 42,
          providerName: "Taller Azul",
          subtotalAmount: "10.50",
          originalSubtotalAmount: 12,
          discountAmount: "1.50",
          status: "READY_FOR_PICKUP",
          paymentStatus: "UNPAID",
          paymentRequired: true,
          paymentSession: {
            providerOrderId: "po-1",
            paymentSessionId: 77,
            externalSessionId: null,
            clientSecret: "secret_1",
            stripeAccountId: "acct_1",
            expiresAt: null,
            paymentStatus: "PENDING",
          },
        },
      ],
      runnerPayment: {
        paymentMode: "DELIVERY_RUNNER_SESSION",
        deliveryOrderId: "do-1",
        runnerId: "runner-1",
        deliveryStatus: "IN_TRANSIT",
        paymentStatus: "UNPAID",
        paymentRequired: true,
        sessionPrepared: true,
        amount: "4.20",
        currency: "EUR",
        pricingDistanceKm: "2.50",
        pickupCount: 2,
        additionalPickupCount: 1,
        baseFee: "2.00",
        perKmFee: 0.7,
        distanceFee: "1.75",
        extraPickupFee: 0.5,
        extraPickupCharge: "0.50",
      },
    })

    const aggregate = await paymentsService.prepareOrderProviderPayments("55")

    expect(apiPostMock).toHaveBeenCalledWith("/payments/orders/55/provider-sessions")
    expect(aggregate).toEqual({
      orderId: "55",
      orderStatus: "PENDING",
      paymentMode: "PROVIDER_ORDER_SESSIONS",
      paymentEnvironment: "READY",
      paymentEnvironmentMessage: null,
      providerPaymentStatus: "PARTIALLY_PAID",
      paidProviderOrders: 1,
      totalProviderOrders: 2,
      providerOrders: [
        {
          providerOrderId: "po-1",
          providerId: "42",
          providerName: "Taller Azul",
          subtotalAmount: 10.5,
          originalSubtotalAmount: 12,
          discountAmount: 1.5,
          status: "READY_FOR_PICKUP",
          paymentStatus: "UNPAID",
          paymentRequired: true,
          paymentSession: {
            providerOrderId: "po-1",
            paymentSessionId: "77",
            externalSessionId: null,
            clientSecret: "secret_1",
            stripeAccountId: "acct_1",
            expiresAt: null,
            paymentStatus: "PENDING",
          },
        },
      ],
      runnerPayment: {
        paymentMode: "DELIVERY_RUNNER_SESSION",
        deliveryOrderId: "do-1",
        runnerId: "runner-1",
        deliveryStatus: "IN_TRANSIT",
        paymentStatus: "UNPAID",
        paymentRequired: true,
        sessionPrepared: true,
        amount: 4.2,
        currency: "EUR",
        pricingDistanceKm: 2.5,
        pickupCount: 2,
        additionalPickupCount: 1,
        baseFee: 2,
        perKmFee: 0.7,
        distanceFee: 1.75,
        extraPickupFee: 0.5,
        extraPickupCharge: 0.5,
      },
    })
  })

  it("normalizes single provider payment session responses", async () => {
    apiPostMock.mockResolvedValueOnce({
      providerOrderId: "po-7",
      paymentSessionId: 99,
      clientSecret: null,
      stripeAccountId: "acct_provider",
      paymentStatus: "READY",
    })

    await expect(
      paymentsService.prepareProviderOrderPayment("po-7"),
    ).resolves.toEqual({
      providerOrderId: "po-7",
      paymentSessionId: "99",
      externalSessionId: null,
      clientSecret: null,
      stripeAccountId: "acct_provider",
      expiresAt: null,
      paymentStatus: "READY",
    })
  })

  it("normalizes runner payment session responses", async () => {
    apiPostMock.mockResolvedValueOnce({
      deliveryOrderId: 12,
      runnerPaymentSessionId: "rps-1",
      externalSessionId: null,
      clientSecret: "secret_runner",
      stripeAccountId: "acct_runner",
      expiresAt: "2026-03-24T10:30:00.000Z",
      paymentStatus: "PENDING",
    })

    await expect(paymentsService.prepareRunnerPayment("12")).resolves.toEqual({
      deliveryOrderId: "12",
      runnerPaymentSessionId: "rps-1",
      externalSessionId: null,
      clientSecret: "secret_runner",
      stripeAccountId: "acct_runner",
      expiresAt: "2026-03-24T10:30:00.000Z",
      paymentStatus: "PENDING",
    })
  })
})
