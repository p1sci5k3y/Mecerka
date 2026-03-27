"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { ProtectedRoute } from "@/components/protected-route"
import { Button } from "@/components/ui/button"
import { Link } from "@/lib/navigation"
import { deliveryIncidentsService } from "@/lib/services/delivery-incidents-service"
import { ordersService } from "@/lib/services/orders-service"
import { refundsService } from "@/lib/services/refunds-service"
import { useToast } from "@/components/ui/use-toast"
import type { DeliveryIncidentSummary, Order, RefundSummary } from "@/lib/types"
import { AlertTriangle, Loader2, Receipt, RotateCcw, Truck } from "lucide-react"

type RunnerOrderWithSupport = Order & {
  incidents: DeliveryIncidentSummary[]
  refunds: RefundSummary[]
}

const INCIDENT_TYPES = [
  "MISSING_ITEMS",
  "DAMAGED_ITEMS",
  "WRONG_DELIVERY",
  "FAILED_DELIVERY",
  "ADDRESS_PROBLEM",
  "SAFETY_CONCERN",
  "OTHER",
] as const

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

function incidentTypeLabel(type: DeliveryIncidentSummary["type"]) {
  switch (type) {
    case "MISSING_ITEMS":
      return "Faltan artículos"
    case "DAMAGED_ITEMS":
      return "Artículos dañados"
    case "WRONG_DELIVERY":
      return "Entrega incorrecta"
    case "FAILED_DELIVERY":
      return "Entrega fallida"
    case "ADDRESS_PROBLEM":
      return "Problema con la dirección"
    case "SAFETY_CONCERN":
      return "Incidencia de seguridad"
    case "OTHER":
      return "Otro"
    default:
      return type
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
  const { toast } = useToast()
  const [orders, setOrders] = useState<RunnerOrderWithSupport[]>([])
  const [loading, setLoading] = useState(true)
  const [targetOrderId, setTargetOrderId] = useState("")
  const [incidentType, setIncidentType] =
    useState<DeliveryIncidentSummary["type"]>("FAILED_DELIVERY")
  const [incidentDescription, setIncidentDescription] = useState("")
  const [incidentEvidenceUrl, setIncidentEvidenceUrl] = useState("")
  const [submittingIncident, setSubmittingIncident] = useState(false)

  const loadData = useCallback(async () => {
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

      setOrders(withSupport)
      setTargetOrderId((currentTargetId) => {
        if (currentTargetId) return currentTargetId
        return withSupport.find((order) => order.deliveryOrder?.id)?.id || ""
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const visibleIncidents = useMemo(
    () => orders.reduce((sum, order) => sum + order.incidents.length, 0),
    [orders],
  )
  const visibleRefunds = useMemo(
    () => orders.reduce((sum, order) => sum + order.refunds.length, 0),
    [orders],
  )
  const visibleOrders = useMemo(
    () =>
      orders.filter((order) => order.refunds.length > 0 || order.incidents.length > 0),
    [orders],
  )
  const selectedOrder =
    orders.find((order) => order.id === targetOrderId && order.deliveryOrder?.id) ?? null

  async function submitIncident() {
    if (!selectedOrder?.deliveryOrder?.id) return

    setSubmittingIncident(true)
    try {
      await deliveryIncidentsService.createIncident({
        deliveryOrderId: selectedOrder.deliveryOrder.id,
        type: incidentType,
        description: incidentDescription,
        ...(incidentEvidenceUrl.trim()
          ? { evidenceUrl: incidentEvidenceUrl.trim() }
          : {}),
      })
      toast({
        title: "Incidencia registrada",
        description: "El caso ya es visible para soporte y backoffice.",
      })
      setIncidentDescription("")
      setIncidentEvidenceUrl("")
      await loadData()
    } catch (error) {
      console.error("Error registrando incidencia runner:", error)
      toast({
        title: "Error",
        description: "No se pudo registrar la incidencia del runner.",
        variant: "destructive",
      })
    } finally {
      setSubmittingIncident(false)
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
              <h2 className="text-xl font-bold text-foreground">Abrir incidencia operativa</h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              El runner también puede abrir incidencias sobre una entrega cuando detecta problemas en ruta o en la confirmación final.
            </p>
            {orders.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-border/70 bg-background/70 px-4 py-6 text-sm text-muted-foreground">
                No hay entregas con reparto asociado sobre las que abrir incidencias.
              </div>
            ) : (
              <div className="mt-4 grid gap-3">
                <label className="space-y-2 text-sm">
                  <span className="font-medium">Entrega</span>
                  <select
                    value={targetOrderId}
                    onChange={(event) => setTargetOrderId(event.target.value)}
                    className="h-10 w-full rounded-md border bg-background px-3"
                  >
                    {orders
                      .filter((order) => order.deliveryOrder?.id)
                      .map((order) => (
                        <option key={order.id} value={order.id}>
                          Pedido #{order.id.slice(0, 8).toUpperCase()}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="space-y-2 text-sm">
                  <span className="font-medium">Tipo</span>
                  <select
                    value={incidentType}
                    onChange={(event) =>
                      setIncidentType(
                        event.target.value as DeliveryIncidentSummary["type"],
                      )
                    }
                    className="h-10 w-full rounded-md border bg-background px-3"
                  >
                    {INCIDENT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {incidentTypeLabel(type)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2 text-sm">
                  <span className="font-medium">Descripción</span>
                  <textarea
                    value={incidentDescription}
                    onChange={(event) => setIncidentDescription(event.target.value)}
                    placeholder="Describe la incidencia detectada en la entrega"
                    className="min-h-[110px] w-full rounded-md border bg-background px-3 py-2"
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="font-medium">Evidencia (URL HTTPS, opcional)</span>
                  <input
                    value={incidentEvidenceUrl}
                    onChange={(event) => setIncidentEvidenceUrl(event.target.value)}
                    placeholder="https://..."
                    className="h-10 w-full rounded-md border bg-background px-3"
                  />
                </label>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    disabled={
                      submittingIncident ||
                      incidentDescription.trim().length < 5 ||
                      !selectedOrder?.deliveryOrder?.id
                    }
                    onClick={() => void submitIncident()}
                  >
                    Registrar incidencia
                  </Button>
                </div>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-bold text-foreground">Casos visibles</h2>
            </div>
            <div className="mt-6 grid gap-4">
              {visibleOrders.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/70 bg-background/70 px-6 py-12 text-center text-sm text-muted-foreground">
                  No hay incidencias ni devoluciones visibles en tus entregas ahora mismo.
                </div>
              ) : (
                visibleOrders.map((order) => (
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
