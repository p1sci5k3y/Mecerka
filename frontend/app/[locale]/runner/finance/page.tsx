"use client"

import { useEffect, useMemo, useState } from "react"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { ProtectedRoute } from "@/components/protected-route"
import { Button } from "@/components/ui/button"
import { Link } from "@/lib/navigation"
import { getApiBaseUrl } from "@/lib/runtime-config"
import { deliveryIncidentsService } from "@/lib/services/delivery-incidents-service"
import { ordersService } from "@/lib/services/orders-service"
import { refundsService } from "@/lib/services/refunds-service"
import { useAuth } from "@/contexts/auth-context"
import type { DeliveryIncidentSummary, Order, RefundSummary } from "@/lib/types"
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  CreditCard,
  Loader2,
  Receipt,
  Truck,
} from "lucide-react"
import { toast } from "sonner"

type RunnerOrderWithSupport = Order & {
  incidents: DeliveryIncidentSummary[]
  refunds: RefundSummary[]
}

function formatCurrency(amount: number) {
  return amount.toLocaleString("es-ES", {
    style: "currency",
    currency: "EUR",
  })
}

function runnerPaymentLabel(paymentStatus?: string | null) {
  switch (paymentStatus) {
    case "PAID":
      return "Cobrado"
    case "PAYMENT_READY":
      return "Sesion lista"
    case "PAYMENT_PENDING":
    case "PENDING":
      return "Pago pendiente"
    case "FAILED":
      return "Pago fallido"
    default:
      return paymentStatus || "Sin estado"
  }
}

export default function RunnerFinancePage() {
  return (
    <ProtectedRoute allowedRoles={["RUNNER"]}>
      <RunnerFinanceContent />
    </ProtectedRoute>
  )
}

function RunnerFinanceContent() {
  const { user } = useAuth()
  const [orders, setOrders] = useState<RunnerOrderWithSupport[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      try {
        const data = await ordersService.getAll()
        const deliveryOrders = data.filter((order) => order.deliveryOrder)
        const withSupport = await Promise.all(
          deliveryOrders.map(async (order) => {
            const deliveryOrderId = order.deliveryOrder?.id
            if (!deliveryOrderId) {
              return { ...order, incidents: [], refunds: [] }
            }

            const [incidents, refunds] = await Promise.all([
              deliveryIncidentsService
                .listDeliveryOrderIncidents(deliveryOrderId)
                .catch(() => [] as DeliveryIncidentSummary[]),
              refundsService
                .getDeliveryOrderRefunds(deliveryOrderId)
                .catch(() => [] as RefundSummary[]),
            ])

            return {
              ...order,
              incidents,
              refunds,
            }
          }),
        )
        setOrders(withSupport)
      } catch (error) {
        console.error("Error loading runner finance center:", error)
      } finally {
        setLoading(false)
      }
    }

    void loadData()
  }, [])

  const paidOrders = useMemo(
    () => orders.filter((order) => order.deliveryOrder?.paymentStatus === "PAID"),
    [orders],
  )
  const pendingOrders = useMemo(
    () =>
      orders.filter(
        (order) =>
          order.deliveryOrder &&
          order.deliveryOrder.paymentStatus !== "PAID" &&
          order.status !== "CANCELLED",
      ),
    [orders],
  )
  const visibleAmount = useMemo(
    () => paidOrders.reduce((sum, order) => sum + order.deliveryFee, 0),
    [paidOrders],
  )
  const visibleIncidents = useMemo(
    () => orders.reduce((sum, order) => sum + order.incidents.length, 0),
    [orders],
  )
  const visibleRefunds = useMemo(
    () => orders.reduce((sum, order) => sum + order.refunds.length, 0),
    [orders],
  )

  const handleStripeConnect = async () => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/payments/connect/link`, {
        credentials: "include",
      })
      if (!res.ok) throw new Error("Failed to get onboarding link")
      const data = await res.json()

      const urlObj = new URL(data.url)
      if (urlObj.protocol !== "https:" || urlObj.hostname !== "connect.stripe.com") {
        throw new Error("Invalid or unsafe Stripe connecting URL")
      }

      globalThis.location.href = urlObj.toString()
    } catch {
      toast.error("No se pudo iniciar la conexión con Stripe.")
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <Navbar />
        <main className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </main>
        <Footer />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background selection:bg-primary/20">
      <Navbar />
      <main className="flex-1 bg-[#FBF6EE] px-6 py-10 transition-colors dark:bg-[#140D0B] md:px-10 lg:px-16">
        <div className="mx-auto flex max-w-7xl flex-col gap-8">
          <div className="flex flex-col gap-3">
            <h1 className="font-display text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
              Cobros del runner
            </h1>
            <p className="max-w-3xl text-lg text-muted-foreground">
              Este centro te enseña qué repartos han quedado cobrados, cuáles siguen pendientes y cuál es el importe visible que ya figura como cobrado en tus entregas.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Cobros confirmados
              </p>
              <p className="mt-3 font-display text-3xl font-bold text-foreground">
                {paidOrders.length}
              </p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Pendientes de cobro
              </p>
              <p className="mt-3 font-display text-3xl font-bold text-foreground">
                {pendingOrders.length}
              </p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Importe visible cobrado
              </p>
              <p className="mt-3 font-display text-3xl font-bold text-foreground">
                {formatCurrency(visibleAmount)}
              </p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Incidencias visibles
              </p>
              <p className="mt-3 font-display text-3xl font-bold text-foreground">
                {visibleIncidents}
              </p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Devoluciones visibles
              </p>
              <p className="mt-3 font-display text-3xl font-bold text-foreground">
                {visibleRefunds}
              </p>
            </div>
          </div>

          <section className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-3">
                <h2 className="text-xl font-bold text-foreground">Stripe Connect</h2>
                {user?.stripeAccountId ? (
                  <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                    <p>
                      Tu cuenta está conectada. Los cobros del runner se pueden liquidar a tu cuenta Stripe Connect cuando el reparto queda pagado.
                    </p>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                    <p>
                      Sin Stripe Connect no puedes recibir liquidaciones reales del reparto. Primero conecta tu cuenta y luego vuelve a este centro.
                    </p>
                  </div>
                )}
              </div>

              {!user?.stripeAccountId ? (
                <Button onClick={handleStripeConnect}>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Conectar con Stripe
                </Button>
              ) : null}
            </div>
          </section>

          <section className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-foreground">Repartos con cobro visible</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Vista operativa del estado de cobro por entrega. Aquí no se fuerzan pagos: solo se hace visible lo que ya consta en el pedido.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href="/runner/support">Centro de soporte</Link>
                <Link href="/runner">Volver al panel operativo</Link>
              </div>
            </div>

            {orders.length === 0 ? (
              <div className="mt-6 rounded-2xl border-2 border-dashed border-border/60 bg-background/70 px-6 py-12 text-center text-muted-foreground">
                Aun no tienes repartos con datos de cobro visibles.
              </div>
            ) : (
              <div className="mt-6 grid gap-4">
                {orders.map((order) => (
                  <article
                    key={order.id}
                    className="rounded-2xl border border-border/60 bg-background/70 p-5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                          DeliveryOrder #{order.deliveryOrder?.id || order.id}
                        </p>
                        <h3 className="mt-2 text-lg font-bold text-foreground">
                          Pedido #{order.id.slice(0, 8).toUpperCase()}
                        </h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Estado de entrega:{" "}
                          <span className="font-medium text-foreground">{order.status}</span>
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Cobro runner:{" "}
                          <span className="font-medium text-foreground">
                            {runnerPaymentLabel(order.deliveryOrder?.paymentStatus)}
                          </span>
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Soporte visible: {order.refunds.length} devoluciones · {order.incidents.length} incidencias
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Importe visible</p>
                        <p className="mt-2 text-xl font-bold text-foreground">
                          {formatCurrency(order.deliveryFee)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex justify-end">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/runner/orders/${order.id}`}>
                          Ver detalle
                        </Link>
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-bold text-foreground">Devoluciones e incidencias economicas</h2>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              El runner no revisa ni ejecuta devoluciones desde este panel. Si un reparto entra en disputa, reembolso o incidencia economica, el caso sigue por soporte y backoffice/admin.
            </p>
            <div className="mt-5 grid gap-4">
              {orders.some((order) => order.refunds.length > 0 || order.incidents.length > 0) ? (
                orders
                  .filter((order) => order.refunds.length > 0 || order.incidents.length > 0)
                  .map((order) => (
                    <article
                      key={`support-${order.id}`}
                      className="rounded-2xl border border-border/60 bg-background/70 p-5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                            Pedido #{order.id.slice(0, 8).toUpperCase()}
                          </p>
                          <p className="mt-2 text-sm text-muted-foreground">
                            {order.refunds.length} devoluciones · {order.incidents.length} incidencias
                          </p>
                        </div>
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/runner/orders/${order.id}`}>
                            Abrir soporte operativo
                          </Link>
                        </Button>
                      </div>
                    </article>
                  ))
              ) : (
                <div className="rounded-2xl border border-dashed border-border/60 bg-background/70 px-6 py-10 text-center text-sm text-muted-foreground">
                  No hay devoluciones ni incidencias visibles en tus repartos ahora mismo.
                </div>
              )}
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button asChild variant="outline">
                <Link href="/runner/support">
                  <AlertCircle className="mr-2 h-4 w-4" />
                  Abrir centro de soporte
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/runner">
                  <Truck className="mr-2 h-4 w-4" />
                  Volver al panel operativo
                </Link>
              </Button>
              <Button asChild>
                <Link href="/profile">
                  Ver mi perfil de cobro
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  )
}
