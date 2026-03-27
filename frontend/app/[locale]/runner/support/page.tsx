"use client"

import { useEffect, useMemo, useState } from "react"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { ProtectedRoute } from "@/components/protected-route"
import { Button } from "@/components/ui/button"
import { Link } from "@/lib/navigation"
import { deliveryIncidentsService } from "@/lib/services/delivery-incidents-service"
import { ordersService } from "@/lib/services/orders-service"
import { refundsService } from "@/lib/services/refunds-service"
import type { DeliveryIncidentSummary, Order, RefundSummary } from "@/lib/types"
import { AlertTriangle, Loader2, Receipt, RotateCcw, Truck } from "lucide-react"

type RunnerOrderWithSupport = Order & {
  incidents: DeliveryIncidentSummary[]
  refunds: RefundSummary[]
}

function refundStatusLabel(status: string) {
  switch (status) {
    case "REQUESTED":
      return "Solicitada"
    case "UNDER_REVIEW":
      return "En revisión"
    case "APPROVED":
      return "Aprobada"
    case "REJECTED":
      return "Rechazada"
    case "EXECUTING":
      return "Ejecutando"
    case "COMPLETED":
      return "Completada"
    case "FAILED":
      return "Fallida"
    default:
      return status
  }
}

function incidentStatusLabel(status: DeliveryIncidentSummary["status"]) {
  switch (status) {
    case "OPEN":
      return "Abierta"
    case "UNDER_REVIEW":
      return "En revisión"
    case "RESOLVED":
      return "Resuelta"
    case "REJECTED":
      return "Rechazada"
    default:
      return status
  }
}

export default function RunnerSupportPage() {
  return (
    <ProtectedRoute allowedRoles={["RUNNER"]}>
      <RunnerSupportContent />
    </ProtectedRoute>
  )
}

function RunnerSupportContent() {
  const [orders, setOrders] = useState<RunnerOrderWithSupport[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      try {
        const data = await ordersService.getAll()
        const withSupport = await Promise.all(
          data
            .filter((order) => order.deliveryOrder?.id)
            .map(async (order) => {
              const deliveryOrderId = order.deliveryOrder?.id
              const [incidents, refunds] = await Promise.all([
                deliveryOrderId
                  ? deliveryIncidentsService
                      .listDeliveryOrderIncidents(deliveryOrderId)
                      .catch(() => [] as DeliveryIncidentSummary[])
                  : Promise.resolve([] as DeliveryIncidentSummary[]),
                deliveryOrderId
                  ? refundsService
                      .getDeliveryOrderRefunds(deliveryOrderId)
                      .catch(() => [] as RefundSummary[])
                  : Promise.resolve([] as RefundSummary[]),
              ])
              return { ...order, incidents, refunds }
            }),
        )

        setOrders(
          withSupport.filter(
            (order) => order.refunds.length > 0 || order.incidents.length > 0,
          ),
        )
      } finally {
        setLoading(false)
      }
    }

    void loadData()
  }, [])

  const visibleIncidents = useMemo(
    () => orders.reduce((sum, order) => sum + order.incidents.length, 0),
    [orders],
  )
  const visibleRefunds = useMemo(
    () => orders.reduce((sum, order) => sum + order.refunds.length, 0),
    [orders],
  )

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
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="flex-1 bg-[#FBF6EE] px-6 py-10 dark:bg-[#140D0B] md:px-10 lg:px-16">
        <div className="mx-auto flex max-w-7xl flex-col gap-8">
          <div className="flex flex-col gap-3">
            <h1 className="font-display text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
              Centro de soporte del runner
            </h1>
            <p className="max-w-3xl text-lg text-muted-foreground">
              Reúne incidencias y devoluciones visibles ligadas a tus entregas para que puedas operar con contexto sin saltar entre cobro y ruta.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Entregas con soporte
              </p>
              <p className="mt-3 font-display text-3xl font-bold text-foreground">
                {orders.length}
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
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/runner/finance">Abrir finanzas</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/runner">Volver al panel</Link>
              </Button>
            </div>
          </section>

          <section className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-bold text-foreground">Casos visibles</h2>
            </div>
            <div className="mt-6 grid gap-4">
              {orders.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/70 bg-background/70 px-6 py-12 text-center text-sm text-muted-foreground">
                  No hay incidencias ni devoluciones visibles en tus entregas ahora mismo.
                </div>
              ) : (
                orders.map((order) => (
                  <article
                    key={order.id}
                    className="rounded-2xl border border-border/60 bg-background/70 p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                          DeliveryOrder #{order.deliveryOrder?.id || order.id}
                        </p>
                        <h3 className="mt-2 text-lg font-bold text-foreground">
                          Pedido #{order.id.slice(0, 8).toUpperCase()}
                        </h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {order.refunds.length} devoluciones · {order.incidents.length} incidencias
                        </p>
                      </div>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/runner/orders/${order.id}`}>Ver ficha operativa</Link>
                      </Button>
                    </div>

                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                      <div className="rounded-xl border border-border/50 bg-card p-4">
                        <div className="flex items-center gap-2">
                          <RotateCcw className="h-4 w-4 text-primary" />
                          <h4 className="font-semibold text-foreground">Devoluciones</h4>
                        </div>
                        <div className="mt-3 space-y-2 text-sm">
                          {order.refunds.length === 0 ? (
                            <p className="text-muted-foreground">Sin devoluciones visibles.</p>
                          ) : (
                            order.refunds.map((refund) => (
                              <p key={refund.id} className="text-muted-foreground">
                                {refund.type} · {refundStatusLabel(refund.status)}
                              </p>
                            ))
                          )}
                        </div>
                      </div>
                      <div className="rounded-xl border border-border/50 bg-card p-4">
                        <div className="flex items-center gap-2">
                          <Receipt className="h-4 w-4 text-primary" />
                          <h4 className="font-semibold text-foreground">Incidencias</h4>
                        </div>
                        <div className="mt-3 space-y-2 text-sm">
                          {order.incidents.length === 0 ? (
                            <p className="text-muted-foreground">Sin incidencias visibles.</p>
                          ) : (
                            order.incidents.map((incident) => (
                              <p key={incident.id} className="text-muted-foreground">
                                {incident.type} · {incidentStatusLabel(incident.status)}
                              </p>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <div className="flex items-start gap-3">
                <Truck className="mt-0.5 h-5 w-5 shrink-0" />
                <p>
                  El runner ve el contexto de soporte, pero la revisión y ejecución económica siguen pasando por soporte y backoffice/admin.
                </p>
              </div>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  )
}
