import { api } from "@/lib/api"
import type {
  OrderProviderPaymentsAggregate,
  ProviderOrderPaymentSummary,
  ProviderPaymentSessionSummary,
  RunnerPaymentSessionSummary,
  RunnerPaymentSummary,
} from "@/lib/types"

type BackendProviderPaymentSession = {
  providerOrderId: string
  paymentSessionId: string
  externalSessionId?: string | null
  clientSecret?: string | null
  stripeAccountId?: string | null
  expiresAt?: string | null
  paymentStatus: string
}

type BackendProviderOrderPaymentSummary = {
  providerOrderId: string
  providerId: string
  providerName?: string
  subtotalAmount: string | number
  originalSubtotalAmount: string | number
  discountAmount: string | number
  status: string
  paymentStatus: string
  paymentRequired: boolean
  paymentSession: BackendProviderPaymentSession | null
}

type BackendRunnerPaymentSummary = {
  paymentMode: string
  deliveryOrderId: string | null
  runnerId: string | null
  deliveryStatus: string | null
  paymentStatus: string
  paymentRequired: boolean
  sessionPrepared: boolean
  amount: string | number
  currency: string
  pricingDistanceKm: string | number
  pickupCount: number
  additionalPickupCount: number
  baseFee: string | number
  perKmFee: string | number
  distanceFee: string | number
  extraPickupFee: string | number
  extraPickupCharge: string | number
}

type BackendOrderProviderPaymentsAggregate = {
  orderId: string
  orderStatus: string
  paymentMode: "PROVIDER_ORDER_SESSIONS"
  paymentEnvironment?: "READY" | "UNAVAILABLE"
  paymentEnvironmentMessage?: string | null
  providerPaymentStatus: "UNPAID" | "PARTIALLY_PAID" | "PAID"
  paidProviderOrders: number
  totalProviderOrders: number
  providerOrders: BackendProviderOrderPaymentSummary[]
  runnerPayment: BackendRunnerPaymentSummary
}

type BackendRunnerPaymentSession = {
  deliveryOrderId: string
  runnerPaymentSessionId: string
  externalSessionId?: string | null
  clientSecret?: string | null
  stripeAccountId?: string | null
  expiresAt?: string | null
  paymentStatus: string
}

function mapProviderPaymentSession(
  session: BackendProviderPaymentSession,
): ProviderPaymentSessionSummary {
  return {
    providerOrderId: String(session.providerOrderId),
    paymentSessionId: String(session.paymentSessionId),
    externalSessionId: session.externalSessionId ?? null,
    clientSecret: session.clientSecret ?? null,
    stripeAccountId: session.stripeAccountId ?? null,
    expiresAt: session.expiresAt ?? null,
    paymentStatus: session.paymentStatus,
  }
}

function mapProviderPaymentSummary(
  providerOrder: BackendProviderOrderPaymentSummary,
): ProviderOrderPaymentSummary {
  return {
    providerOrderId: String(providerOrder.providerOrderId),
    providerId: String(providerOrder.providerId),
    providerName: providerOrder.providerName,
    subtotalAmount:
      typeof providerOrder.subtotalAmount === "number"
        ? providerOrder.subtotalAmount
        : Number(providerOrder.subtotalAmount),
    originalSubtotalAmount:
      typeof providerOrder.originalSubtotalAmount === "number"
        ? providerOrder.originalSubtotalAmount
        : Number(providerOrder.originalSubtotalAmount),
    discountAmount:
      typeof providerOrder.discountAmount === "number"
        ? providerOrder.discountAmount
        : Number(providerOrder.discountAmount),
    status: providerOrder.status,
    paymentStatus: providerOrder.paymentStatus,
    paymentRequired: providerOrder.paymentRequired,
    paymentSession: providerOrder.paymentSession
      ? mapProviderPaymentSession(providerOrder.paymentSession)
      : null,
  }
}

function mapRunnerPaymentSummary(
  runnerPayment: BackendRunnerPaymentSummary,
): RunnerPaymentSummary {
  return {
    paymentMode: runnerPayment.paymentMode,
    deliveryOrderId: runnerPayment.deliveryOrderId,
    runnerId: runnerPayment.runnerId,
    deliveryStatus: runnerPayment.deliveryStatus,
    paymentStatus: runnerPayment.paymentStatus,
    paymentRequired: runnerPayment.paymentRequired,
    sessionPrepared: runnerPayment.sessionPrepared,
    amount:
      typeof runnerPayment.amount === "number"
        ? runnerPayment.amount
        : Number(runnerPayment.amount),
    currency: runnerPayment.currency,
    pricingDistanceKm:
      typeof runnerPayment.pricingDistanceKm === "number"
        ? runnerPayment.pricingDistanceKm
        : Number(runnerPayment.pricingDistanceKm),
    pickupCount: runnerPayment.pickupCount,
    additionalPickupCount: runnerPayment.additionalPickupCount,
    baseFee:
      typeof runnerPayment.baseFee === "number"
        ? runnerPayment.baseFee
        : Number(runnerPayment.baseFee),
    perKmFee:
      typeof runnerPayment.perKmFee === "number"
        ? runnerPayment.perKmFee
        : Number(runnerPayment.perKmFee),
    distanceFee:
      typeof runnerPayment.distanceFee === "number"
        ? runnerPayment.distanceFee
        : Number(runnerPayment.distanceFee),
    extraPickupFee:
      typeof runnerPayment.extraPickupFee === "number"
        ? runnerPayment.extraPickupFee
        : Number(runnerPayment.extraPickupFee),
    extraPickupCharge:
      typeof runnerPayment.extraPickupCharge === "number"
        ? runnerPayment.extraPickupCharge
        : Number(runnerPayment.extraPickupCharge),
  }
}

function mapOrderProviderPaymentsAggregate(
  aggregate: BackendOrderProviderPaymentsAggregate,
): OrderProviderPaymentsAggregate {
  return {
    orderId: String(aggregate.orderId),
    orderStatus: aggregate.orderStatus,
    paymentMode: aggregate.paymentMode,
    paymentEnvironment: aggregate.paymentEnvironment ?? "READY",
    paymentEnvironmentMessage: aggregate.paymentEnvironmentMessage ?? null,
    providerPaymentStatus: aggregate.providerPaymentStatus,
    paidProviderOrders: aggregate.paidProviderOrders,
    totalProviderOrders: aggregate.totalProviderOrders,
    providerOrders: aggregate.providerOrders.map(mapProviderPaymentSummary),
    runnerPayment: mapRunnerPaymentSummary(aggregate.runnerPayment),
  }
}

export const paymentsService = {
  async prepareOrderProviderPayments(orderId: string) {
    const data = await api.post<BackendOrderProviderPaymentsAggregate>(
      `/payments/orders/${orderId}/provider-sessions`,
    )
    return mapOrderProviderPaymentsAggregate(data)
  },

  async prepareProviderOrderPayment(providerOrderId: string) {
    const data = await api.post<BackendProviderPaymentSession>(
      `/payments/provider-order/${providerOrderId}/session`,
    )
    return mapProviderPaymentSession(data)
  },

  async prepareRunnerPayment(deliveryOrderId: string) {
    const data = await api.post<BackendRunnerPaymentSession>(
      `/delivery/orders/${deliveryOrderId}/payment-session`,
    )
    return {
      deliveryOrderId: String(data.deliveryOrderId),
      runnerPaymentSessionId: String(data.runnerPaymentSessionId),
      externalSessionId: data.externalSessionId ?? null,
      clientSecret: data.clientSecret ?? null,
      stripeAccountId: data.stripeAccountId ?? null,
      expiresAt: data.expiresAt ?? null,
      paymentStatus: data.paymentStatus,
    } satisfies RunnerPaymentSessionSummary
  },
}
