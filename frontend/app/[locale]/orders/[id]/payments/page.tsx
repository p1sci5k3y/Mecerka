"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { usePathname, useRouter } from "@/lib/navigation"
import {
  ArrowLeft,
  CreditCard,
  Loader2,
  PackageCheck,
  RefreshCcw,
  ShoppingBag,
  Store,
  Truck,
} from "lucide-react"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/auth-context"
import { StripeDirectCheckout } from "@/components/payments/stripe-direct-checkout"
import { ordersService } from "@/lib/services/orders-service"
import { paymentsService } from "@/lib/services/payments-service"
import { getPublicRuntimeConfig } from "@/lib/runtime-config"
import { toast } from "sonner"
import type {
  Order,
  OrderProviderPaymentsAggregate,
  ProviderOrderPaymentSummary,
  ProviderPaymentSessionSummary,
  RunnerPaymentSessionSummary,
  RunnerPaymentSummary,
} from "@/lib/types"

const INACTIVE_PROVIDER_STATUSES = new Set([
  "REJECTED",
  "REJECTED_BY_STORE",
  "CANCELLED",
  "EXPIRED",
  "DELIVERED",
])

function formatCurrency(amount: number) {
  return amount.toLocaleString("es-ES", {
    style: "currency",
    currency: "EUR",
  })
}

function paymentStatusLabel(status: string) {
  switch (status) {
    case "PAID":
      return "Pagado"
    case "PAYMENT_READY":
      return "Sesión lista"
    case "PAYMENT_PENDING":
      return "Pago pendiente"
    case "FAILED":
      return "Fallido"
    case "PENDING":
      return "Pendiente"
    default:
      return status
  }
}

function fallbackProviderPayments(order: Order | null): ProviderOrderPaymentSummary[] {
  if (!order?.providerOrders) {
    return []
  }

  return order.providerOrders.map((providerOrder) => ({
    providerOrderId: providerOrder.id,
    providerId: providerOrder.providerId,
    providerName:
      providerOrder.providerName ||
      providerOrder.items[0]?.product?.provider?.name ||
      `Proveedor ${providerOrder.providerId.slice(0, 6)}`,
    subtotalAmount: providerOrder.subtotal,
    originalSubtotalAmount: providerOrder.originalSubtotal,
    discountAmount: providerOrder.discountAmount,
    status: providerOrder.status,
    paymentStatus: providerOrder.paymentStatus || "PENDING",
    paymentRequired:
      providerOrder.paymentStatus !== "PAID" &&
      !INACTIVE_PROVIDER_STATUSES.has(providerOrder.status),
    paymentSession: null,
  }))
}

function fallbackRunnerPayment(order: Order | null): RunnerPaymentSummary {
  if (!order?.deliveryOrder) {
    return {
      paymentMode: "DELIVERY_ORDER_SESSION",
      deliveryOrderId: null,
      runnerId: null,
      deliveryStatus: null,
      paymentStatus: "NOT_CREATED",
      paymentRequired: false,
      sessionPrepared: false,
      amount: order?.deliveryFee || 0,
      currency: "EUR",
      pricingDistanceKm: order?.deliveryDistanceKm || 0,
      pickupCount: order?.providerOrders?.length || 0,
      additionalPickupCount: Math.max((order?.providerOrders?.length || 0) - 1, 0),
      baseFee: order?.runnerBaseFee || 0,
      perKmFee: order?.runnerPerKmFee || 0,
      distanceFee: Number(
        (((order?.deliveryDistanceKm || 0) * (order?.runnerPerKmFee || 0)).toFixed(2)),
      ),
      extraPickupFee: order?.runnerExtraPickupFee || 0,
      extraPickupCharge: Number(
        (
          Math.max((order?.providerOrders?.length || 0) - 1, 0) *
          (order?.runnerExtraPickupFee || 0)
        ).toFixed(2),
      ),
    }
  }

  return {
    paymentMode: "DELIVERY_ORDER_SESSION",
    deliveryOrderId: order.deliveryOrder.id,
    runnerId: order.deliveryOrder.runnerId,
    deliveryStatus: order.deliveryOrder.status,
    paymentStatus: order.deliveryOrder.paymentStatus,
    paymentRequired: order.deliveryOrder.paymentStatus !== "PAID",
    sessionPrepared: false,
    amount: order.deliveryFee || 0,
    currency: "EUR",
    pricingDistanceKm: order.deliveryDistanceKm || 0,
    pickupCount: order.providerOrders?.length || 0,
    additionalPickupCount: Math.max((order.providerOrders?.length || 0) - 1, 0),
    baseFee: order.runnerBaseFee || 0,
    perKmFee: order.runnerPerKmFee || 0,
    distanceFee: Number(
      (((order.deliveryDistanceKm || 0) * (order.runnerPerKmFee || 0)).toFixed(2)),
    ),
    extraPickupFee: order.runnerExtraPickupFee || 0,
    extraPickupCharge: Number(
      (
        Math.max((order.providerOrders?.length || 0) - 1, 0) *
        (order.runnerExtraPickupFee || 0)
      ).toFixed(2),
    ),
  }
}

export default function OrderPaymentsPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const pathname = usePathname()
  const { user, isAuthenticated, isLoading } = useAuth()
  const [order, setOrder] = useState<Order | null>(null)
  const [paymentsAggregate, setPaymentsAggregate] =
    useState<OrderProviderPaymentsAggregate | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)
  const [aggregateError, setAggregateError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [preparingProviderId, setPreparingProviderId] = useState<string | null>(
    null,
  )
  const [openProviderSession, setOpenProviderSession] = useState<{
    providerOrderId: string
    session: ProviderPaymentSessionSummary
  } | null>(null)
  const [preparingRunner, setPreparingRunner] = useState(false)
  const [runnerSession, setRunnerSession] =
    useState<RunnerPaymentSessionSummary | null>(null)
  const [stripePublishableKey, setStripePublishableKey] = useState<string | null>(
    null,
  )

  const orderId = typeof params.id === "string" ? params.id : ""
  const stripeClientUsable = Boolean(
    stripePublishableKey && !stripePublishableKey.includes("dummy"),
  )

  useEffect(() => {
    void getPublicRuntimeConfig().then((config) => {
      setStripePublishableKey(config.stripePublishableKey ?? null)
    })
  }, [])

  useEffect(() => {
    if (isLoading) {
      return
    }

    if (!isAuthenticated) {
      router.replace(`/login?returnTo=${encodeURIComponent(pathname)}`)
      return
    }

    if (user && !user.roles.includes("CLIENT")) {
      router.replace("/dashboard")
    }
  }, [isAuthenticated, isLoading, pathname, router, user])

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!orderId) {
        setPageError("No encontramos el pedido que quieres pagar.")
        setLoading(false)
        return
      }

      if (mode === "initial") {
        setLoading(true)
      } else {
        setRefreshing(true)
      }

      try {
        const orderResult = await ordersService.getOne(orderId)
        setOrder(orderResult)
        setPageError(null)

        try {
          const aggregate =
            await paymentsService.prepareOrderProviderPayments(orderId)
          setPaymentsAggregate(aggregate)
          setAggregateError(
            aggregate.paymentEnvironment === "UNAVAILABLE"
              ? aggregate.paymentEnvironmentMessage ||
                  "Este entorno no puede preparar pagos Stripe reales."
              : null,
          )
        } catch (error: any) {
          setPaymentsAggregate(null)
          setAggregateError(
            error?.message ||
              "No pudimos preparar las sesiones de pago para este pedido.",
          )
        }
      } catch (error: any) {
        setPageError(error?.message || "No pudimos cargar el pedido.")
      } finally {
        if (mode === "initial") {
          setLoading(false)
        } else {
          setRefreshing(false)
        }
      }
    },
    [orderId],
  )

  useEffect(() => {
    if (!isAuthenticated || !orderId) {
      return
    }

    void loadPage()
  }, [isAuthenticated, loadPage, orderId])

  const providerPayments = useMemo(
    () => paymentsAggregate?.providerOrders ?? fallbackProviderPayments(order),
    [order, paymentsAggregate],
  )

  const runnerPayment = useMemo(
    () => paymentsAggregate?.runnerPayment ?? fallbackRunnerPayment(order),
    [order, paymentsAggregate],
  )

  const rootOrderStatus = paymentsAggregate?.orderStatus ?? order?.status
  const paymentsUnavailable =
    paymentsAggregate?.paymentEnvironment === "UNAVAILABLE"
  const paidCount = paymentsAggregate?.paidProviderOrders ?? 0
  const totalCount = paymentsAggregate?.totalProviderOrders ?? providerPayments.length

  const prepareProviderPayment = async (providerOrderId: string) => {
    setPreparingProviderId(providerOrderId)
    try {
      const session =
        await paymentsService.prepareProviderOrderPayment(providerOrderId)

      setPaymentsAggregate((current) =>
        current
          ? {
              ...current,
              providerOrders: current.providerOrders.map((providerOrder) =>
                providerOrder.providerOrderId === providerOrderId
                  ? {
                      ...providerOrder,
                      paymentStatus: session.paymentStatus,
                      paymentRequired: true,
                      paymentSession: session,
                    }
                  : providerOrder,
              ),
            }
          : current,
      )

      if (stripeClientUsable && session.clientSecret && session.stripeAccountId) {
        setOpenProviderSession({ providerOrderId, session })
      } else {
        toast.info(
          "La sesión de pago ya está preparada en backend, pero este entorno local no puede completar Stripe.",
        )
      }
    } catch (error: any) {
      toast.error(
        error?.message || "No pudimos preparar el pago de este comercio.",
      )
    } finally {
      setPreparingProviderId(null)
    }
  }

  const prepareRunnerPayment = async () => {
    if (!runnerPayment.deliveryOrderId) {
      return
    }

    setPreparingRunner(true)
    try {
      const session = await paymentsService.prepareRunnerPayment(
        runnerPayment.deliveryOrderId,
      )
      setRunnerSession(session)

      if (!stripeClientUsable || !session.clientSecret || !session.stripeAccountId) {
        toast.info(
          "El pago del reparto está separado y preparado, pero este entorno local no puede completar Stripe.",
        )
      }
    } catch (error: any) {
      toast.error(
        error?.message || "No pudimos preparar el pago del reparto.",
      )
    } finally {
      setPreparingRunner(false)
    }
  }

  if (isLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!isAuthenticated || !user?.roles.includes("CLIENT")) {
    return null
  }

  return (
    <div className="flex min-h-screen flex-col bg-background/50">
      <Navbar />
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-4 py-12 lg:px-8">
          <div className="mb-8 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => router.push("/cart")}
              className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver a la cesta
            </button>
            <h1 className="font-display text-4xl font-extrabold text-foreground">
              Pedido y pagos por comercio
            </h1>
            <p className="max-w-3xl text-lg text-muted-foreground">
              Este pedido multiproveedor no se paga como un cobro único de plataforma. Cada comercio prepara su propio pago y el reparto queda separado.
            </p>
          </div>

          {pageError ? (
            <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-5 text-sm text-destructive">
              {pageError}
            </div>
          ) : null}

          {aggregateError ? (
            <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
              <div className="font-semibold">Este entorno no puede completar el cobro Stripe real.</div>
              <p className="mt-2">
                El pedido raíz ya existe y los pagos siguen separados por comercio. La estructura económica del pedido sigue siendo válida aunque este entorno no abra las sesiones reales de cobro.
              </p>
              <p className="mt-2">{aggregateError}</p>
            </div>
          ) : null}

          <div className="grid gap-8 lg:grid-cols-12 lg:items-start">
            <section className="flex flex-col gap-6 lg:col-span-7 xl:col-span-8">
              <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                      Pedido raíz
                    </p>
                    <h2 className="mt-2 font-mono text-sm text-foreground">
                      {order?.id || orderId}
                    </h2>
                    <p className="mt-3 text-sm text-muted-foreground">
                      Estado actual:{" "}
                      <span className="font-semibold text-foreground">
                        {rootOrderStatus || "Pendiente"}
                      </span>
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Entrega geolocalizada:{" "}
                      <span className="font-medium text-foreground">
                        {order?.deliveryAddress || "Pendiente"}, {order?.postalCode || "sin CP"}
                      </span>
                    </p>
                  </div>

                  <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-primary">
                    <div className="font-semibold">Pagos por comercio</div>
                    <p className="mt-1">
                      {paidCount} de {totalCount} cubiertos
                    </p>
                  </div>
                </div>
              </div>

              {providerPayments.map((providerOrder) => {
                const canOpenStripe =
                  stripeClientUsable &&
                  providerOrder.paymentSession?.clientSecret &&
                  providerOrder.paymentSession.stripeAccountId

                const isOpen =
                  openProviderSession?.providerOrderId ===
                  providerOrder.providerOrderId

                return (
                  <article
                    key={providerOrder.providerOrderId}
                    className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                          <Store className="h-4 w-4 text-primary" />
                          Comercio
                        </div>
                        <h3 className="mt-2 text-xl font-bold text-foreground">
                          {providerOrder.providerName ||
                            `Proveedor ${providerOrder.providerId.slice(0, 6)}`}
                        </h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                          ProviderOrder <span className="font-mono">{providerOrder.providerOrderId}</span>
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Subtotal</p>
                        {providerOrder.discountAmount > 0 ? (
                          <p className="text-sm text-muted-foreground line-through">
                            {formatCurrency(providerOrder.originalSubtotalAmount)}
                          </p>
                        ) : null}
                        <p className="text-2xl font-extrabold text-foreground">
                          {formatCurrency(providerOrder.subtotalAmount)}
                        </p>
                        {providerOrder.discountAmount > 0 ? (
                          <p className="mt-2 text-xs font-semibold text-emerald-700">
                            Descuento aplicado por este comercio: -
                            {formatCurrency(providerOrder.discountAmount)}
                          </p>
                        ) : null}
                        <p className="mt-2 text-sm font-semibold text-primary">
                          {paymentStatusLabel(providerOrder.paymentStatus)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-border/50 bg-background/70 p-4 text-sm">
                      <p className="text-muted-foreground">
                        Subtotal original:{" "}
                        <span className="font-semibold text-foreground">
                          {formatCurrency(providerOrder.originalSubtotalAmount)}
                        </span>
                      </p>
                      {providerOrder.discountAmount > 0 ? (
                        <p className="text-muted-foreground">
                          Descuento del comercio:{" "}
                          <span className="font-semibold text-emerald-700">
                            -{formatCurrency(providerOrder.discountAmount)}
                          </span>
                        </p>
                      ) : null}
                      <p className="text-muted-foreground">
                        Estado operativo:{" "}
                        <span className="font-semibold text-foreground">
                          {providerOrder.status}
                        </span>
                      </p>
                      <p className="text-muted-foreground">
                        Pago requerido:{" "}
                        <span className="font-semibold text-foreground">
                          {providerOrder.paymentRequired ? "Sí" : "No"}
                        </span>
                      </p>
                      {providerOrder.paymentSession?.expiresAt ? (
                        <p className="text-muted-foreground">
                          Sesión preparada hasta:{" "}
                          <span className="font-medium text-foreground">
                            {new Date(
                              providerOrder.paymentSession.expiresAt,
                            ).toLocaleString("es-ES")}
                          </span>
                        </p>
                      ) : null}
                    </div>

                    {providerOrder.paymentRequired ? (
                      <div className="mt-5 flex flex-col gap-4">
                        <div className="flex flex-wrap gap-3">
                          <Button
                            onClick={() =>
                              void prepareProviderPayment(
                                providerOrder.providerOrderId,
                              )
                            }
                            disabled={
                              paymentsUnavailable ||
                              preparingProviderId === providerOrder.providerOrderId
                            }
                            className="gap-2"
                          >
                            {preparingProviderId === providerOrder.providerOrderId ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Preparando pago...
                              </>
                            ) : (
                              <>
                                <CreditCard className="h-4 w-4" />
                                {providerOrder.paymentSession
                                  ? "Revisar pago de este comercio"
                                  : "Preparar pago de este comercio"}
                              </>
                            )}
                          </Button>

                          {providerOrder.paymentSession && canOpenStripe ? (
                            <Button
                              variant="outline"
                              onClick={() =>
                                setOpenProviderSession({
                                  providerOrderId: providerOrder.providerOrderId,
                                  session: providerOrder.paymentSession!,
                                })
                              }
                            >
                              Abrir formulario de pago
                            </Button>
                          ) : null}
                        </div>

                        {paymentsUnavailable ? (
                          <p className="text-sm text-muted-foreground">
                            Este entorno demo conserva el pedido multiproveedor y sus subtotales, pero no abre cobros Stripe reales por comercio.
                          </p>
                        ) : !stripeClientUsable ? (
                          <p className="text-sm text-muted-foreground">
                            Este entorno local usa claves Stripe dummy. La sesión real se prepara contra el endpoint oficial, pero no puede completarse aquí.
                          </p>
                        ) : null}

                        {isOpen &&
                        providerOrder.paymentSession?.clientSecret &&
                        providerOrder.paymentSession.stripeAccountId ? (
                          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
                            <StripeDirectCheckout
                              clientSecret={
                                providerOrder.paymentSession.clientSecret
                              }
                              stripeAccountId={
                                providerOrder.paymentSession.stripeAccountId
                              }
                              totalAmount={providerOrder.subtotalAmount}
                              publishableKey={stripePublishableKey}
                              onPaymentSuccess={() => {
                                setOpenProviderSession(null)
                                void loadPage("refresh")
                              }}
                            />
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                        Este comercio ya no requiere cobro adicional en este pedido.
                      </div>
                    )}
                  </article>
                )
              })}
            </section>

            <aside className="lg:col-span-5 xl:col-span-4">
              <div className="sticky top-24 flex flex-col gap-6">
                <section className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
                  <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    <Truck className="h-4 w-4 text-primary" />
                    Reparto y runner
                  </div>
                  <h2 className="mt-2 text-xl font-bold text-foreground">
                    Pago separado del reparto
                  </h2>
                  <p className="mt-3 text-sm text-muted-foreground">
                    El reparto no se mezcla con los pagos a comercios. Su estado se gestiona aparte.
                  </p>

                  <div className="mt-5 space-y-2 text-sm">
                    <p className="text-muted-foreground">
                      Importe oficial del reparto:{" "}
                      <span className="font-semibold text-foreground">
                        {formatCurrency(runnerPayment.amount)}
                      </span>
                    </p>
                    <p className="text-muted-foreground">
                      Estado de entrega:{" "}
                      <span className="font-semibold text-foreground">
                        {runnerPayment.deliveryStatus || "Sin runner asignado"}
                      </span>
                    </p>
                    <p className="text-muted-foreground">
                      Estado de pago runner:{" "}
                      <span className="font-semibold text-foreground">
                        {paymentStatusLabel(runnerPayment.paymentStatus)}
                      </span>
                    </p>
                    <p className="text-muted-foreground">
                      Requiere pago:{" "}
                      <span className="font-semibold text-foreground">
                        {runnerPayment.paymentRequired ? "Sí" : "No"}
                      </span>
                    </p>
                  </div>

                  <div className="mt-5 rounded-2xl border border-border/50 bg-background/70 p-4 text-sm">
                    <div className="font-semibold text-foreground">
                      Fórmula oficial del reparto
                    </div>
                    <div className="mt-3 space-y-2 text-muted-foreground">
                      <p>
                        Base:{" "}
                        <span className="font-medium text-foreground">
                          {formatCurrency(runnerPayment.baseFee)}
                        </span>
                      </p>
                      <p>
                        Distancia considerada:{" "}
                        <span className="font-medium text-foreground">
                          {runnerPayment.pricingDistanceKm.toFixed(2)} km
                        </span>
                        {" · "}
                        <span className="font-medium text-foreground">
                          {formatCurrency(runnerPayment.distanceFee)}
                        </span>
                      </p>
                      <p>
                        Recogidas:{" "}
                        <span className="font-medium text-foreground">
                          {runnerPayment.pickupCount}
                        </span>
                        {runnerPayment.additionalPickupCount > 0 ? (
                          <>
                            {" · suplemento extra: "}
                            <span className="font-medium text-foreground">
                              {formatCurrency(runnerPayment.extraPickupCharge)}
                            </span>
                          </>
                        ) : null}
                      </p>
                    </div>
                  </div>

                  {runnerPayment.paymentRequired && runnerPayment.deliveryOrderId ? (
                    <div className="mt-5 flex flex-col gap-4">
                      <Button
                        variant="outline"
                        onClick={() => void prepareRunnerPayment()}
                        disabled={paymentsUnavailable || preparingRunner}
                      >
                        {preparingRunner ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Preparando pago de reparto...
                          </>
                        ) : (
                          "Preparar pago de reparto"
                        )}
                      </Button>

                      {runnerSession?.clientSecret &&
                      runnerSession.stripeAccountId &&
                      stripeClientUsable ? (
                        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
                          <StripeDirectCheckout
                            clientSecret={runnerSession.clientSecret}
                            stripeAccountId={runnerSession.stripeAccountId}
                            totalAmount={runnerPayment.amount}
                            publishableKey={stripePublishableKey}
                            onPaymentSuccess={() => {
                              setRunnerSession(null)
                              void loadPage("refresh")
                            }}
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : paymentsUnavailable ? (
                    <p className="mt-4 text-sm text-muted-foreground">
                      En la demo el runner sigue siendo un pago separado y visible, pero el cobro Stripe real queda desactivado de forma explícita.
                    </p>
                  ) : (
                    <p className="mt-4 text-sm text-muted-foreground">
                      El pago del runner se activará solo cuando exista un runner asignado y su sesión de cobro separada esté disponible.
                    </p>
                  )}
                </section>

                <section className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
                  <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    <ShoppingBag className="h-4 w-4 text-primary" />
                    Acciones
                  </div>
                  <div className="mt-5 flex flex-col gap-3">
                    <Button
                      variant="outline"
                      onClick={() => void loadPage("refresh")}
                      disabled={refreshing}
                    >
                      {refreshing ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Actualizando estado...
                        </>
                      ) : (
                        <>
                          <RefreshCcw className="mr-2 h-4 w-4" />
                          Actualizar estado de pagos
                        </>
                      )}
                    </Button>
                    <Button variant="outline" onClick={() => router.push("/products")}>
                      Seguir comprando
                    </Button>
                  </div>
                </section>
              </div>
            </aside>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
