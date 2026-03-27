"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { ProtectedRoute } from "@/components/protected-route"
import { Button } from "@/components/ui/button"
import { Link } from "@/lib/navigation"
import { deliveryIncidentsService } from "@/lib/services/delivery-incidents-service"
import { ordersService } from "@/lib/services/orders-service"
import { refundsService } from "@/lib/services/refunds-service"
import type { DeliveryIncidentSummary, Order, ProviderOrder, RefundSummary } from "@/lib/types"
import {
  AlertTriangle,
  ArrowLeft,
  CreditCard,
  Loader2,
  MapPin,
  PackageCheck,
  Route,
  Store,
  Truck,
} from "lucide-react"

type RunnerOrderDetail = {
  order: Order
  incidents: DeliveryIncidentSummary[]
  refunds: RefundSummary[]
}

function formatCurrency(amount: number) {
  return amount.toLocaleString("es-ES", {
    style: "currency",
    currency: "EUR",
  })
}

function deliveryStatusLabel(status?: string | null) {
  switch (status) {
    case "ASSIGNED":
      return "Asignado"
    case "IN_TRANSIT":
      return "En reparto"
    case "DELIVERED":
      return "Entregado"
    case "CANCELLED":
      return "Cancelado"
    default:
      return status || "Sin estado"
  }
}

function runnerPaymentLabel(status?: string | null) {
  switch (status) {
    case "PAID":
      return "Cobrado"
    case "PAYMENT_READY":
      return "Sesión lista"
    case "PAYMENT_PENDING":
    case "PENDING":
      return "Pago pendiente"
    case "FAILED":
      return "Pago fallido"
    default:
      return status || "Sin estado"
  }
}

function pickupStatusLabel(status: ProviderOrder["status"]) {
  switch (status) {
    case "READY_FOR_PICKUP":
      return "Listo para recoger"
    case "PICKED_UP":
      return "Recogido"
    case "PREPARING":
    case "ACCEPTED":
    case "PENDING":
      return "En preparación"
    case "DELIVERED":
      return "Entregado"
    case "CANCELLED":
      return "Cancelado"
    case "REJECTED_BY_STORE":
      return "No disponible"
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

export default function RunnerOrderDetailPage() {
  return (
    <ProtectedRoute allowedRoles={["RUNNER"]}>
      <RunnerOrderDetailContent />
    </ProtectedRoute>
  )
}

function RunnerOrderDetailContent() {
  const params = useParams<{ id: string }>()
  const [detail, setDetail] = useState<RunnerOrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const orderId = typeof params.id === "string" ? params.id : ""

  useEffect(() => {
    async function loadOrder() {
      if (!orderId) {
        setLoading(false)
        return
      }

      try {
        const data = await ordersService.getOne(orderId)
        let incidents: DeliveryIncidentSummary[] = []
        let refunds: RefundSummary[] = []

        if (data.deliveryOrder?.id) {
          try {
            incidents = await deliveryIncidentsService.listDeliveryOrderIncidents(
              data.deliveryOrder.id,
            )
          } catch {
            incidents = []
          }

          try {
            refunds = await refundsService.getDeliveryOrderRefunds(data.deliveryOrder.id)
          } catch {
            refunds = []
          }
        }

        setDetail({
          order: data,
          incidents,
          refunds,
        })
        setError(null)
      } catch (loadError) {
        console.error("Error loading runner order detail:", loadError)
        setError("No pudimos cargar esta entrega.")
      } finally {
        setLoading(false)
      }
    }

    void loadOrder()
  }, [orderId])

  const activeStops = useMemo(
    () =>
      (detail?.order.providerOrders || []).filter(
        (providerOrder) =>
          providerOrder.status !== "CANCELLED" &&
          providerOrder.status !== "REJECTED_BY_STORE",
      ),
    [detail],
  )

  const packageCount = useMemo(
    () =>
      activeStops.reduce(
        (sum, providerOrder) =>
          sum + providerOrder.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
        0,
      ),
    [activeStops],
  )

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="flex-1 bg-[#FBF6EE] px-6 py-10 dark:bg-[#140D0B] md:px-10 lg:px-16">
        <div className="mx-auto flex max-w-6xl flex-col gap-8">
          <div className="flex flex-col gap-3">
            <Button asChild variant="outline" className="self-start">
              <Link href="/runner">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Volver al panel operativo
              </Link>
            </Button>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                  Pedido #{orderId.slice(0, 8).toUpperCase()}
                </p>
                <h1 className="font-display text-4xl font-extrabold tracking-tight text-foreground">
                  Ficha de entrega del runner
                </h1>
                <p className="mt-2 max-w-3xl text-lg text-muted-foreground">
                  Aquí se juntan ruta, recogidas, entrega y estado de cobro sin saltar entre paneles.
                </p>
              </div>
              {detail ? (
                <div className="rounded-2xl border border-primary/20 bg-primary/5 px-5 py-4 text-sm text-primary">
                  <div className="font-semibold">Estado actual</div>
                  <div className="mt-1 text-lg font-bold text-foreground">
                    {deliveryStatusLabel(detail.order.deliveryOrder?.status || detail.order.status)}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {error ? (
            <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-5 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {detail ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Fee visible
                  </p>
                  <p className="mt-3 text-3xl font-extrabold text-foreground">
                    {formatCurrency(detail.order.deliveryFee)}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Paradas activas
                  </p>
                  <p className="mt-3 text-3xl font-extrabold text-foreground">
                    {activeStops.length}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Paquetes
                  </p>
                  <p className="mt-3 text-3xl font-extrabold text-foreground">
                    {packageCount}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Cobro runner
                  </p>
                  <p className="mt-3 text-2xl font-extrabold text-foreground">
                    {runnerPaymentLabel(detail.order.deliveryOrder?.paymentStatus)}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Incidencias visibles
                  </p>
                  <p className="mt-3 text-3xl font-extrabold text-foreground">
                    {detail.incidents.length}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Devoluciones visibles
                  </p>
                  <p className="mt-3 text-3xl font-extrabold text-foreground">
                    {detail.refunds.length}
                  </p>
                </div>
              </div>

              <section className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
                <div className="flex flex-wrap gap-3">
                  <Button asChild>
                    <Link href="/runner/finance">
                      <CreditCard className="mr-2 h-4 w-4" />
                      Abrir cobros del runner
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/runner/support">
                      <AlertTriangle className="mr-2 h-4 w-4" />
                      Abrir soporte
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/runner">
                      Volver al panel
                    </Link>
                  </Button>
                </div>
              </section>

              <div className="grid gap-8 lg:grid-cols-[1.15fr,0.85fr]">
                <section className="space-y-6">
                  <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
                    <div className="flex items-center gap-2">
                      <Route className="h-5 w-5 text-primary" />
                      <h2 className="text-xl font-bold text-foreground">
                        Recogidas del trayecto
                      </h2>
                    </div>
                    <div className="mt-5 space-y-3">
                      {activeStops.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border/70 bg-background/70 px-4 py-8 text-center text-sm text-muted-foreground">
                          No hay paradas operativas visibles para esta entrega.
                        </div>
                      ) : (
                        activeStops.map((providerOrder) => (
                          <article
                            key={providerOrder.id}
                            className="rounded-xl border border-border/50 bg-background/60 p-4"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold text-foreground">
                                  {providerOrder.providerName || providerOrder.providerId}
                                </p>
                                <p className="mt-1 text-sm text-muted-foreground">
                                  {providerOrder.items.reduce((sum, item) => sum + item.quantity, 0)} unidad(es)
                                </p>
                              </div>
                              <p className="font-semibold text-foreground">
                                {pickupStatusLabel(providerOrder.status)}
                              </p>
                            </div>
                          </article>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-5 w-5 text-primary" />
                      <h2 className="text-xl font-bold text-foreground">
                        Entrega final
                      </h2>
                    </div>
                    <div className="mt-5 space-y-3 text-sm">
                      <p className="text-muted-foreground">
                        Dirección:{" "}
                        <span className="font-semibold text-foreground">
                          {detail.order.deliveryAddress || "Pendiente de direccion"}
                        </span>
                      </p>
                      <p className="text-muted-foreground">
                        Ciudad:{" "}
                        <span className="font-semibold text-foreground">
                          {detail.order.city || "Sin ciudad"}
                        </span>
                      </p>
                      <p className="text-muted-foreground">
                        Distancia planificada:{" "}
                        <span className="font-semibold text-foreground">
                          {detail.order.deliveryDistanceKm != null
                            ? `${detail.order.deliveryDistanceKm.toFixed(1)} km`
                            : "No disponible"}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-primary" />
                      <h2 className="text-xl font-bold text-foreground">
                        Incidencias y devoluciones visibles
                      </h2>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Lectura operativa del soporte asociado a esta entrega. El runner no resuelve el caso aquí, pero ya no pierde el contexto.
                    </p>
                    <div className="mt-5 space-y-3">
                      {detail.incidents.map((incident) => (
                        <article
                          key={incident.id}
                          className="rounded-xl border border-border/50 bg-background/60 p-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-foreground">{incident.type}</p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {incidentStatusLabel(incident.status)}
                              </p>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {new Date(incident.createdAt).toLocaleString("es-ES")}
                            </p>
                          </div>
                          <p className="mt-3 text-sm text-muted-foreground">
                            {incident.description}
                          </p>
                        </article>
                      ))}
                      {detail.refunds.map((refund) => (
                        <article
                          key={refund.id}
                          className="rounded-xl border border-border/50 bg-background/60 p-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-foreground">{refund.type}</p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {refundStatusLabel(refund.status)}
                              </p>
                            </div>
                            <p className="font-semibold text-foreground">
                              {formatCurrency(refund.amount)}
                            </p>
                          </div>
                        </article>
                      ))}
                      {detail.incidents.length === 0 && detail.refunds.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border/70 bg-background/70 px-4 py-8 text-center text-sm text-muted-foreground">
                          No hay incidencias ni devoluciones visibles para esta entrega.
                        </div>
                      ) : null}
                    </div>
                  </div>
                </section>

                <aside className="space-y-6">
                  <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
                    <div className="flex items-center gap-2">
                      <Truck className="h-5 w-5 text-primary" />
                      <h2 className="text-xl font-bold text-foreground">
                        Estado operativo
                      </h2>
                    </div>
                    <div className="mt-5 space-y-3 text-sm">
                      <p className="text-muted-foreground">
                        DeliveryOrder:{" "}
                        <span className="font-semibold text-foreground">
                          {detail.order.deliveryOrder?.id || "Sin delivery order"}
                        </span>
                      </p>
                      <p className="text-muted-foreground">
                        Estado entrega:{" "}
                        <span className="font-semibold text-foreground">
                          {deliveryStatusLabel(detail.order.deliveryOrder?.status || detail.order.status)}
                        </span>
                      </p>
                      <p className="text-muted-foreground">
                        Cobro:{" "}
                        <span className="font-semibold text-foreground">
                          {runnerPaymentLabel(detail.order.deliveryOrder?.paymentStatus)}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
                    <div className="flex items-center gap-2">
                      <PackageCheck className="h-5 w-5 text-primary" />
                      <h2 className="text-xl font-bold text-foreground">
                        Lectura económica
                      </h2>
                    </div>
                    <p className="mt-4 text-sm text-muted-foreground">
                      Esta ficha no ejecuta devoluciones ni disputas. Te deja ver si el reparto ya consta como cobrado y te manda al centro financiero cuando toca revisar liquidaciones.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
                    <div className="flex items-center gap-2">
                      <Store className="h-5 w-5 text-primary" />
                      <h2 className="text-xl font-bold text-foreground">
                        Contexto de pedido
                      </h2>
                    </div>
                    <div className="mt-5 space-y-3 text-sm">
                      <p className="text-muted-foreground">
                        Order raíz:{" "}
                        <span className="font-semibold text-foreground">
                          {detail.order.id}
                        </span>
                      </p>
                      <p className="text-muted-foreground">
                        Creado:{" "}
                        <span className="font-semibold text-foreground">
                          {new Date(detail.order.createdAt).toLocaleString("es-ES")}
                        </span>
                      </p>
                    </div>
                  </div>
                </aside>
              </div>
            </>
          ) : null}
        </div>
      </main>
      <Footer />
    </div>
  )
}
