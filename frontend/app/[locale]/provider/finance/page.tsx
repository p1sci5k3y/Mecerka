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
import type { DeliveryIncidentSummary, ProviderOrder, RefundSummary } from "@/lib/types"
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  Loader2,
  Receipt,
  RotateCcw,
} from "lucide-react"
import { toast } from "sonner"

type ProviderOrderWithRefunds = ProviderOrder & {
  rootOrderId: string
  rootOrderCreatedAt: string
  refunds: RefundSummary[]
  incidents: DeliveryIncidentSummary[]
}

function formatCurrency(amount: number) {
  return amount.toLocaleString("es-ES", {
    style: "currency",
    currency: "EUR",
  })
}

function providerPaymentLabel(paymentStatus?: string) {
  switch (paymentStatus) {
    case "PAID":
      return "Cobrado"
    case "PAYMENT_READY":
      return "Sesión lista"
    case "PAYMENT_PENDING":
      return "Pago pendiente"
    case "FAILED":
      return "Pago fallido"
    default:
      return paymentStatus || "Sin estado"
  }
}

export default function ProviderFinancePage() {
  return (
    <ProtectedRoute allowedRoles={["PROVIDER"]}>
      <ProviderFinanceContent />
    </ProtectedRoute>
  )
}

function ProviderFinanceContent() {
  const { user } = useAuth()
  const [providerOrders, setProviderOrders] = useState<ProviderOrderWithRefunds[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      if (!user?.userId) {
        return
      }

      try {
        const orders = await ordersService.getAll()
        const ownProviderOrders = orders.flatMap((order) =>
          (order.providerOrders || [])
            .filter((providerOrder) => providerOrder.providerId === String(user.userId))
            .map((providerOrder) => ({
              ...providerOrder,
              rootOrderId: order.id,
              rootOrderCreatedAt: order.createdAt,
            })),
        )

        const refundsByProviderOrder: Array<readonly [string, RefundSummary[]]> =
          await Promise.all(
          ownProviderOrders.map(async (providerOrder) => {
            try {
              const refunds = await refundsService.getProviderOrderRefunds(
                providerOrder.id,
              )
              return [providerOrder.id, refunds] as const
            } catch {
              return [providerOrder.id, [] as RefundSummary[]] as const
            }
          }),
        )

        const incidentsByProviderOrder: Array<readonly [string, DeliveryIncidentSummary[]]> =
          await Promise.all(
            ownProviderOrders.map(async (providerOrder) => {
              const parentOrder = orders.find((order) => order.id === providerOrder.rootOrderId)
              if (!parentOrder?.deliveryOrder?.id) {
                return [providerOrder.id, [] as DeliveryIncidentSummary[]] as const
              }
              try {
                const incidents = await deliveryIncidentsService.listDeliveryOrderIncidents(
                  parentOrder.deliveryOrder.id,
                )
                return [providerOrder.id, incidents] as const
              } catch {
                return [providerOrder.id, [] as DeliveryIncidentSummary[]] as const
              }
            }),
          )

        const refundMap = new Map(refundsByProviderOrder)
        const incidentMap = new Map(incidentsByProviderOrder)
        setProviderOrders(
          ownProviderOrders.map((providerOrder) => ({
            ...providerOrder,
            refunds: refundMap.get(providerOrder.id) || [],
            incidents: incidentMap.get(providerOrder.id) || [],
          })),
        )
      } catch (error) {
        console.error("Error loading provider finance center:", error)
        setProviderOrders([])
        toast.error("No se pudo cargar el centro financiero del provider.")
      } finally {
        setLoading(false)
      }
    }

    void loadData()
  }, [user?.userId])

  const refundableOrders = useMemo(
    () =>
      providerOrders.filter(
        (providerOrder) =>
          providerOrder.paymentStatus === "PAID" &&
          providerOrder.status !== "CANCELLED" &&
          providerOrder.status !== "REJECTED_BY_STORE",
      ),
    [providerOrders],
  )
  const paidOrders = useMemo(
    () =>
      providerOrders.filter((providerOrder) => providerOrder.paymentStatus === "PAID"),
    [providerOrders],
  )
  const totalRefunds = useMemo(
    () =>
      providerOrders.reduce(
        (sum, providerOrder) =>
          sum +
          providerOrder.refunds.reduce((refundSum, refund) => refundSum + refund.amount, 0),
        0,
      ),
    [providerOrders],
  )
  const totalIncidents = useMemo(
    () =>
      providerOrders.reduce(
        (sum, providerOrder) => sum + providerOrder.incidents.length,
        0,
      ),
    [providerOrders],
  )
  const visibleRefunds = useMemo(
    () =>
      providerOrders.flatMap((providerOrder) =>
        providerOrder.refunds.map((refund) => ({
          ...refund,
          providerOrderTitle: providerOrder.items[0]?.product?.name || providerOrder.id,
          providerOrderId: providerOrder.id,
        })),
      ),
    [providerOrders],
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
              Cobros y devoluciones
            </h1>
            <p className="max-w-3xl text-lg text-muted-foreground">
              Este centro te enseña lo que ya has cobrado, qué pedidos podrían entrar en devolución y qué devoluciones existen ya para tus provider orders.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Provider orders cobrados
              </p>
              <p className="mt-3 font-display text-3xl font-bold text-foreground">
                {paidOrders.length}
              </p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Potencialmente reembolsables
              </p>
              <p className="mt-3 font-display text-3xl font-bold text-foreground">
                {refundableOrders.length}
              </p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Devoluciones visibles
              </p>
              <p className="mt-3 font-display text-3xl font-bold text-foreground">
                {formatCurrency(totalRefunds)}
              </p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Incidencias visibles
              </p>
              <p className="mt-3 font-display text-3xl font-bold text-foreground">
                {totalIncidents}
              </p>
            </div>
          </div>

          <section className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-3">
                <h2 className="text-xl font-bold text-foreground">
                  Stripe Connect
                </h2>
                {user?.stripeAccountId ? (
                  <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                    <p>
                      Tu cuenta está conectada. Los cobros del provider se enrutan a tu cuenta Stripe Connect cuando el pedido queda pagado.
                    </p>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                    <p>
                      Sin Stripe Connect no puedes cobrar pedidos reales. Primero conecta tu cuenta bancaria y luego vuelve a este centro.
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
                <h2 className="text-xl font-bold text-foreground">
                  Provider orders cobrados
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Vista operativa de cobro real por pedido de proveedor.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button asChild variant="outline">
                  <Link href="/provider/support">Centro de soporte</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/provider/sales">
                    Volver al panel operativo
                  </Link>
                </Button>
              </div>
            </div>

            <div className="mt-6 grid gap-4">
              {paidOrders.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/70 bg-background/70 px-6 py-14 text-center">
                  <Receipt className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-4 font-semibold text-foreground">
                    Todavía no tienes provider orders cobrados.
                  </p>
                </div>
              ) : (
                paidOrders.map((providerOrder) => (
                  <article
                    key={providerOrder.id}
                    className="rounded-2xl border border-border/60 bg-background/70 p-5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                          ProviderOrder #{providerOrder.id.slice(0, 8).toUpperCase()}
                        </p>
                        <h3 className="mt-2 text-lg font-bold text-foreground">
                          {providerOrder.items[0]?.product?.name || "Pedido de proveedor"}
                        </h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Cobro: {providerPaymentLabel(providerOrder.paymentStatus)}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Soporte visible: {providerOrder.refunds.length} devoluciones ·{" "}
                          {providerOrder.incidents.length} incidencias
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Subtotal</p>
                        <p className="mt-2 text-xl font-bold text-foreground">
                          {formatCurrency(providerOrder.subtotal)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex justify-end">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/provider/sales/${providerOrder.id}`}>
                          Ver detalle
                        </Link>
                      </Button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-bold text-foreground">
                Devoluciones visibles
              </h2>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Como provider puedes ver devoluciones ligadas a tus provider orders. La revisión y ejecución siguen siendo flujos de backoffice/admin.
            </p>

            <div className="mt-6 grid gap-4">
              {visibleRefunds.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/70 bg-background/70 px-6 py-14 text-center">
                  <RotateCcw className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-4 font-semibold text-foreground">
                    No hay devoluciones visibles todavía para tus provider orders.
                  </p>
                </div>
              ) : (
                visibleRefunds.map((refund) => (
                  <article
                    key={refund.id}
                    className="rounded-2xl border border-border/60 bg-background/70 p-5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                          Refund #{refund.id.slice(0, 8).toUpperCase()}
                        </p>
                        <h3 className="mt-2 text-lg font-bold text-foreground">
                          {refund.providerOrderTitle}
                        </h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Estado: {refund.status} · Tipo: {refund.type}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Soporte ligado al provider order
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Importe</p>
                        <p className="mt-2 text-xl font-bold text-foreground">
                          {formatCurrency(refund.amount)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex justify-end">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/provider/sales/${refund.providerOrderId}`}>
                          Ver detalle
                        </Link>
                      </Button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  )
}
