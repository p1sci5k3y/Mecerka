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
import { useAuth } from "@/contexts/auth-context"
import type { DeliveryIncidentSummary, ProviderOrder, RefundSummary } from "@/lib/types"
import { useToast } from "@/components/ui/use-toast"
import { AlertTriangle, Loader2, Receipt, RotateCcw } from "lucide-react"

type ProviderOrderWithSupport = ProviderOrder & {
  rootOrderId: string
  deliveryOrderId: string | null
  refunds: RefundSummary[]
  incidents: DeliveryIncidentSummary[]
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

export default function ProviderSupportPage() {
  return (
    <ProtectedRoute allowedRoles={["PROVIDER"]}>
      <ProviderSupportContent />
    </ProtectedRoute>
  )
}

function ProviderSupportContent() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [providerOrders, setProviderOrders] = useState<ProviderOrderWithSupport[]>([])
  const [loading, setLoading] = useState(true)
  const [targetProviderOrderId, setTargetProviderOrderId] = useState("")
  const [incidentType, setIncidentType] =
    useState<DeliveryIncidentSummary["type"]>("DAMAGED_ITEMS")
  const [incidentDescription, setIncidentDescription] = useState("")
  const [incidentEvidenceUrl, setIncidentEvidenceUrl] = useState("")
  const [submittingIncident, setSubmittingIncident] = useState(false)

  const loadData = useCallback(async () => {
    if (!user?.userId) {
      setLoading(false)
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
            deliveryOrderId: order.deliveryOrder?.id || null,
          })),
      )

      const withSupport = await Promise.all(
        ownProviderOrders.map(async (providerOrder) => {
          const [refunds, incidents] = await Promise.all([
            refundsService
              .getProviderOrderRefunds(providerOrder.id)
              .catch(() => [] as RefundSummary[]),
            providerOrder.deliveryOrderId
              ? deliveryIncidentsService
                  .listDeliveryOrderIncidents(providerOrder.deliveryOrderId)
                  .catch(() => [] as DeliveryIncidentSummary[])
              : Promise.resolve([] as DeliveryIncidentSummary[]),
          ])

          return {
            ...providerOrder,
            refunds,
            incidents,
          }
        }),
      )

      setProviderOrders(withSupport)
      setTargetProviderOrderId((currentTargetId) => {
        if (currentTargetId) return currentTargetId
        return withSupport.find((providerOrder) => providerOrder.deliveryOrderId)?.id || ""
      })
    } finally {
      setLoading(false)
    }
  }, [user?.userId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const visibleIncidents = useMemo(
    () =>
      providerOrders.reduce(
        (sum, providerOrder) => sum + providerOrder.incidents.length,
        0,
      ),
    [providerOrders],
  )
  const visibleRefunds = useMemo(
    () =>
      providerOrders.reduce(
        (sum, providerOrder) => sum + providerOrder.refunds.length,
        0,
      ),
    [providerOrders],
  )
  const providerOrdersWithDelivery = useMemo(
    () =>
      providerOrders.filter(
        (providerOrder) => typeof providerOrder.deliveryOrderId === "string",
      ),
    [providerOrders],
  )
  const visibleProviderOrders = useMemo(
    () =>
      providerOrders.filter(
        (providerOrder) =>
          providerOrder.refunds.length > 0 || providerOrder.incidents.length > 0,
      ),
    [providerOrders],
  )
  const selectedProviderOrder =
    providerOrdersWithDelivery.find(
      (providerOrder) => providerOrder.id === targetProviderOrderId,
    ) ?? null

  async function submitIncident() {
    if (!selectedProviderOrder?.deliveryOrderId) return

    setSubmittingIncident(true)
    try {
      await deliveryIncidentsService.createIncident({
        deliveryOrderId: selectedProviderOrder.deliveryOrderId,
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
      console.error("Error registrando incidencia provider:", error)
      toast({
        title: "Error",
        description: "No se pudo registrar la incidencia del comercio.",
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
              Centro de soporte del comercio
            </h1>
            <p className="max-w-3xl text-lg text-muted-foreground">
              Reúne incidencias y devoluciones visibles sobre tus provider orders para que no tengas que buscarlas entre ventas y finanzas.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Provider orders con soporte
              </p>
              <p className="mt-3 font-display text-3xl font-bold text-foreground">
                {providerOrders.length}
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
                <Link href="/provider/finance">Abrir finanzas</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/provider/sales">Volver a ventas</Link>
              </Button>
            </div>
          </section>

          <section className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-bold text-foreground">Abrir incidencia operativa</h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Si un caso afecta a la preparación, recogida o entrega, el comercio puede abrirlo desde aquí sin depender solo del cliente.
            </p>
            {providerOrdersWithDelivery.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-border/70 bg-background/70 px-4 py-6 text-sm text-muted-foreground">
                No hay provider orders con entrega asociada sobre los que abrir incidencias.
              </div>
            ) : (
              <div className="mt-4 grid gap-3">
                <label className="space-y-2 text-sm">
                  <span className="font-medium">Provider order</span>
                  <select
                    value={targetProviderOrderId}
                    onChange={(event) => setTargetProviderOrderId(event.target.value)}
                    className="h-10 w-full rounded-md border bg-background px-3"
                  >
                    {providerOrdersWithDelivery.map((providerOrder) => (
                      <option key={providerOrder.id} value={providerOrder.id}>
                        {providerOrder.providerName ?? "Comercio"} · Pedido #{providerOrder.rootOrderId.slice(0, 8).toUpperCase()}
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
                    placeholder="Describe el problema operativo detectado"
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
                      !selectedProviderOrder?.deliveryOrderId
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
              {visibleProviderOrders.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/70 bg-background/70 px-6 py-12 text-center text-sm text-muted-foreground">
                  No hay incidencias ni devoluciones visibles para tu comercio ahora mismo.
                </div>
              ) : (
                visibleProviderOrders.map((providerOrder) => (
                  <article
                    key={providerOrder.id}
                    className="rounded-2xl border border-border/60 bg-background/70 p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                          ProviderOrder #{providerOrder.id.slice(0, 8).toUpperCase()}
                        </p>
                        <h3 className="mt-2 text-lg font-bold text-foreground">
                          {providerOrder.items[0]?.product?.name || providerOrder.id}
                        </h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Pedido cliente #{providerOrder.rootOrderId.slice(0, 8).toUpperCase()}
                        </p>
                      </div>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/provider/sales/${providerOrder.id}`}>Ver ficha operativa</Link>
                      </Button>
                    </div>

                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                      <div className="rounded-xl border border-border/50 bg-card p-4">
                        <div className="flex items-center gap-2">
                          <RotateCcw className="h-4 w-4 text-primary" />
                          <h4 className="font-semibold text-foreground">Devoluciones</h4>
                        </div>
                        <div className="mt-3 space-y-2 text-sm">
                          {providerOrder.refunds.length === 0 ? (
                            <p className="text-muted-foreground">Sin devoluciones visibles.</p>
                          ) : (
                            providerOrder.refunds.map((refund) => (
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
                          {providerOrder.incidents.length === 0 ? (
                            <p className="text-muted-foreground">Sin incidencias visibles.</p>
                          ) : (
                            providerOrder.incidents.map((incident) => (
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
          </section>
        </div>
      </main>
      <Footer />
    </div>
  )
}
