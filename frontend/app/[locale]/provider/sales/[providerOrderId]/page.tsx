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
import { useAuth } from "@/contexts/auth-context"
import type { DeliveryIncidentSummary, Order, ProviderOrder, RefundSummary } from "@/lib/types"
import {
  AlertTriangle,
  ArrowLeft,
  CreditCard,
  Loader2,
  PackageCheck,
  Receipt,
  RotateCcw,
  Store,
  Truck,
} from "lucide-react"

type ProviderOrderDetail = {
  rootOrder: Order
  providerOrder: ProviderOrder
  refunds: RefundSummary[]
  incidents: DeliveryIncidentSummary[]
}

function formatCurrency(amount: number) {
  return amount.toLocaleString("es-ES", {
    style: "currency",
    currency: "EUR",
  })
}

function providerStatusLabel(status: ProviderOrder["status"]) {
  switch (status) {
    case "PENDING":
      return "Pendiente"
    case "ACCEPTED":
      return "Aceptado"
    case "PREPARING":
      return "Preparando"
    case "READY_FOR_PICKUP":
      return "Listo para recogida"
    case "PICKED_UP":
      return "Recogido"
    case "DELIVERED":
      return "Entregado"
    case "CANCELLED":
      return "Cancelado"
    case "REJECTED_BY_STORE":
      return "Rechazado por comercio"
    default:
      return "Sin estado"
  }
}

function paymentStatusLabel(status?: string) {
  switch (status) {
    case "PAID":
      return "Cobrado"
    case "PAYMENT_READY":
      return "Sesión lista"
    case "PAYMENT_PENDING":
      return "Pago pendiente"
    case "FAILED":
      return "Pago fallido"
    default:
      return "Sin estado"
  }
}

function orderStatusLabel(status: Order["status"]) {
  switch (status) {
    case "PENDING":
      return "Pendiente"
    case "CONFIRMED":
      return "Confirmado"
    case "READY_FOR_ASSIGNMENT":
      return "Listo para asignación"
    case "ASSIGNED":
      return "Repartidor asignado"
    case "IN_TRANSIT":
      return "En reparto"
    case "DELIVERED":
      return "Entregado"
    case "CANCELLED":
      return "Cancelado"
    default:
      return "Sin estado"
  }
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
      return "Sin estado"
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
      return "Sin estado"
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
      return "Sin estado"
  }
}

export default function ProviderOrderDetailPage() {
  return (
    <ProtectedRoute allowedRoles={["PROVIDER"]}>
      <ProviderOrderDetailContent />
    </ProtectedRoute>
  )
}

function ProviderOrderDetailContent() {
  const params = useParams<{ providerOrderId: string }>()
  const { user } = useAuth()
  const [detail, setDetail] = useState<ProviderOrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const providerOrderId =
    typeof params.providerOrderId === "string" ? params.providerOrderId : ""

  useEffect(() => {
    async function loadDetail() {
      if (!user?.userId || !providerOrderId) {
        setLoading(false)
        return
      }

      try {
        const orders = await ordersService.getAll()
        const safeOrders = Array.isArray(orders) ? orders : []
        const match = safeOrders
          .map((order) => ({
            rootOrder: order,
            providerOrder: order.providerOrders?.find(
              (providerOrder) =>
                providerOrder.id === providerOrderId &&
                providerOrder.providerId === String(user.userId),
            ),
          }))
          .find((entry) => entry.providerOrder)

        if (!match?.providerOrder) {
          setError("No encontramos este provider order en tu panel.")
          return
        }

        let refunds: RefundSummary[] = []
        try {
          const refundData = await refundsService.getProviderOrderRefunds(match.providerOrder.id)
          refunds = Array.isArray(refundData) ? refundData : []
        } catch {
          refunds = []
        }

        let incidents: DeliveryIncidentSummary[] = []
        if (match.rootOrder.deliveryOrder?.id) {
          try {
            const incidentData = await deliveryIncidentsService.listDeliveryOrderIncidents(
              match.rootOrder.deliveryOrder.id,
            )
            incidents = Array.isArray(incidentData) ? incidentData : []
          } catch {
            incidents = []
          }
        }

        setDetail({
          rootOrder: match.rootOrder,
          providerOrder: match.providerOrder,
          refunds,
          incidents,
        })
        setError(null)
      } catch (loadError) {
        console.error("Error loading provider order detail:", loadError)
        setError("No pudimos cargar esta ficha operativa.")
      } finally {
        setLoading(false)
      }
    }

    void loadDetail()
  }, [providerOrderId, user?.userId])

  const lineCount = useMemo(
    () => detail?.providerOrder.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0,
    [detail],
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
              <Link href="/provider/sales">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Volver al panel operativo
              </Link>
            </Button>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                  ProviderOrder #{providerOrderId.slice(0, 8).toUpperCase()}
                </p>
                <h1 className="font-display text-4xl font-extrabold tracking-tight text-foreground">
                  Ficha operativa del provider order
                </h1>
                <p className="mt-2 max-w-3xl text-lg text-muted-foreground">
                  Aquí se juntan operación, cobro y devoluciones del tramo de tu comercio sin saltar entre paneles.
                </p>
              </div>
              {detail ? (
                <div className="rounded-2xl border border-primary/20 bg-primary/5 px-5 py-4 text-sm text-primary">
                  <div className="font-semibold">Estado del comercio</div>
                  <div className="mt-1 text-lg font-bold text-foreground">
                    {providerStatusLabel(detail.providerOrder.status)}
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
                    Subtotal
                  </p>
                  <p className="mt-3 text-3xl font-extrabold text-foreground">
                    {formatCurrency(detail.providerOrder.subtotal)}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Líneas del comercio
                  </p>
                  <p className="mt-3 text-3xl font-extrabold text-foreground">
                    {lineCount}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Cobro
                  </p>
                  <p className="mt-3 text-2xl font-extrabold text-foreground">
                    {paymentStatusLabel(detail.providerOrder.paymentStatus)}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Refunds visibles
                  </p>
                  <p className="mt-3 text-3xl font-extrabold text-foreground">
                    {detail.refunds.length}
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
              </div>

              <section className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
                <div className="flex flex-wrap gap-3">
                  <Button asChild>
                    <Link href="/provider/finance">
                      <CreditCard className="mr-2 h-4 w-4" />
                      Abrir cobros y devoluciones
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/provider/support">
                      <AlertTriangle className="mr-2 h-4 w-4" />
                      Abrir soporte
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/provider/sales">
                      Volver al kanban
                    </Link>
                  </Button>
                </div>
              </section>

              <div className="grid gap-8 lg:grid-cols-[1.15fr,0.85fr]">
                <section className="space-y-6">
                  <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
                    <div className="flex items-center gap-2">
                      <PackageCheck className="h-5 w-5 text-primary" />
                      <h2 className="text-xl font-bold text-foreground">
                        Líneas del pedido del comercio
                      </h2>
                    </div>
                    <div className="mt-5 space-y-4">
                      {detail.providerOrder.items.map((item) => (
                        <article
                          key={item.id}
                          className="rounded-xl border border-border/50 bg-background/60 p-4"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="font-semibold text-foreground">
                                {item.product?.name || `Producto ${item.productId}`}
                              </p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {item.quantity} unidad(es) · {formatCurrency(item.unitPrice)} por unidad
                              </p>
                            </div>
                            <p className="font-semibold text-foreground">
                              {formatCurrency(item.unitPrice * item.quantity)}
                            </p>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
                    <div className="flex items-center gap-2">
                      <RotateCcw className="h-5 w-5 text-primary" />
                      <h2 className="text-xl font-bold text-foreground">
                        Devoluciones de este provider order
                      </h2>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Visibilidad operativa para el comercio. La resolución y ejecución siguen en backoffice/admin.
                    </p>
                    <div className="mt-5 space-y-3">
                      {detail.refunds.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border/70 bg-background/70 px-4 py-8 text-center text-sm text-muted-foreground">
                          No hay devoluciones visibles todavía para este tramo.
                        </div>
                      ) : (
                        detail.refunds.map((refund) => (
                          <article
                            key={refund.id}
                            className="rounded-xl border border-border/50 bg-background/60 p-4"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold text-foreground">
                                  {refund.type}
                                </p>
                                <p className="mt-1 text-sm text-muted-foreground">
                                  {refundStatusLabel(refund.status)}
                                </p>
                              </div>
                              <p className="font-semibold text-foreground">
                                {formatCurrency(refund.amount)}
                              </p>
                            </div>
                          </article>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-primary" />
                      <h2 className="text-xl font-bold text-foreground">
                        Incidencias logísticas relacionadas
                      </h2>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Visibilidad compartida del tramo de entrega para que el comercio entienda si hay incidencias abiertas o ya resueltas.
                    </p>
                    <div className="mt-5 space-y-3">
                      {detail.incidents.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border/70 bg-background/70 px-4 py-8 text-center text-sm text-muted-foreground">
                          No hay incidencias visibles para esta entrega.
                        </div>
                      ) : (
                        detail.incidents.map((incident) => (
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
                        ))
                      )}
                    </div>
                  </div>
                </section>

                <aside className="space-y-6">
                  <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
                    <div className="flex items-center gap-2">
                      <Receipt className="h-5 w-5 text-primary" />
                      <h2 className="text-xl font-bold text-foreground">
                        Pedido raíz
                      </h2>
                    </div>
                    <div className="mt-5 space-y-3 text-sm">
                      <p className="text-muted-foreground">
                        Order:{" "}
                        <span className="font-semibold text-foreground">
                          {detail.rootOrder.id}
                        </span>
                      </p>
                      <p className="text-muted-foreground">
                        Estado raíz:{" "}
                        <span className="font-semibold text-foreground">
                          {orderStatusLabel(detail.rootOrder.status)}
                        </span>
                      </p>
                      <p className="text-muted-foreground">
                        Creado:{" "}
                        <span className="font-semibold text-foreground">
                          {new Date(detail.rootOrder.createdAt).toLocaleString("es-ES")}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
                    <div className="flex items-center gap-2">
                      <Truck className="h-5 w-5 text-primary" />
                      <h2 className="text-xl font-bold text-foreground">
                        Entrega y recogida
                      </h2>
                    </div>
                    <div className="mt-5 space-y-3 text-sm">
                      <p className="text-muted-foreground">
                        Dirección:{" "}
                        <span className="font-semibold text-foreground">
                          {detail.rootOrder.deliveryAddress || "Pendiente"}
                        </span>
                      </p>
                      <p className="text-muted-foreground">
                        Estado reparto:{" "}
                        <span className="font-semibold text-foreground">
                          {detail.rootOrder.deliveryOrder
                            ? deliveryStatusLabel(detail.rootOrder.deliveryOrder.status)
                            : "Sin reparto asignado"}
                        </span>
                      </p>
                      <p className="text-muted-foreground">
                        Pago reparto:{" "}
                        <span className="font-semibold text-foreground">
                          {paymentStatusLabel(detail.rootOrder.deliveryOrder?.paymentStatus)}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
                    <div className="flex items-center gap-2">
                      <Store className="h-5 w-5 text-primary" />
                      <h2 className="text-xl font-bold text-foreground">
                        Contexto del comercio
                      </h2>
                    </div>
                    <div className="mt-5 space-y-3 text-sm">
                      <p className="text-muted-foreground">
                        Comercio:{" "}
                        <span className="font-semibold text-foreground">
                          {detail.providerOrder.providerName || detail.providerOrder.providerId}
                        </span>
                      </p>
                      <p className="text-muted-foreground">
                        Estado operativo:{" "}
                        <span className="font-semibold text-foreground">
                          {providerStatusLabel(detail.providerOrder.status)}
                        </span>
                      </p>
                      <p className="text-muted-foreground">
                        Estado de cobro:{" "}
                        <span className="font-semibold text-foreground">
                          {paymentStatusLabel(detail.providerOrder.paymentStatus)}
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
