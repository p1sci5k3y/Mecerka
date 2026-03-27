"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"

import dynamic from "next/dynamic"
import { Navbar } from "@/components/navbar"
import { ProtectedRoute } from "@/components/protected-route"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { ordersService } from "@/lib/services/orders-service"
import { deliveryIncidentsService } from "@/lib/services/delivery-incidents-service"
import { refundsService } from "@/lib/services/refunds-service"
import type { DeliveryIncidentSummary, Order, RefundSummary } from "@/lib/types"
import { useToast } from "@/components/ui/use-toast"

const DynamicDeliveryMap = dynamic(
  () => import("@/components/tracking/DynamicDeliveryMap"),
  {
    ssr: false,
    loading: () => (
      <div className="h-[400px] w-full animate-pulse rounded-xl bg-muted" />
    ),
  },
)

const INCIDENT_TYPES = [
  "MISSING_ITEMS",
  "DAMAGED_ITEMS",
  "WRONG_DELIVERY",
  "FAILED_DELIVERY",
  "ADDRESS_PROBLEM",
  "SAFETY_CONCERN",
  "OTHER",
] as const

type RefundTarget =
  | {
      kind: "delivery"
      id: string
      label: string
      defaultAmount: number
    }
  | {
      kind: "provider"
      id: string
      label: string
      defaultAmount: number
    }

function formatCurrency(amount: number) {
  return amount.toLocaleString("es-ES", {
    style: "currency",
    currency: "EUR",
  })
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

function refundStatusLabel(status: RefundSummary["status"]) {
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

function refundTypeOptions(target: RefundTarget | null) {
  if (!target) return []
  return target.kind === "delivery"
    ? [
        { value: "DELIVERY_FULL", label: "Reembolso total del reparto" },
        { value: "DELIVERY_PARTIAL", label: "Reembolso parcial del reparto" },
      ]
    : [
        { value: "PROVIDER_FULL", label: "Reembolso total del comercio" },
        { value: "PROVIDER_PARTIAL", label: "Reembolso parcial del comercio" },
      ]
}

export default function TrackOrderPage() {
  const params = useParams()
  const { user } = useAuth()
  const { toast } = useToast()
  const orderId =
    typeof params.id === "string"
      ? params.id
      : Array.isArray(params.id)
        ? params.id[0] || ""
        : ""

  const isRunner = user?.roles?.includes("RUNNER")
  const isClient = user?.roles?.includes("CLIENT")
  const [order, setOrder] = useState<Order | null>(null)
  const [incidents, setIncidents] = useState<DeliveryIncidentSummary[]>([])
  const [refunds, setRefunds] = useState<RefundSummary[]>([])
  const [supportLoading, setSupportLoading] = useState(true)
  const [incidentType, setIncidentType] =
    useState<DeliveryIncidentSummary["type"]>("MISSING_ITEMS")
  const [incidentDescription, setIncidentDescription] = useState("")
  const [incidentEvidenceUrl, setIncidentEvidenceUrl] = useState("")
  const [submittingIncident, setSubmittingIncident] = useState(false)
  const [selectedRefundTargetId, setSelectedRefundTargetId] = useState("")
  const [refundType, setRefundType] = useState<
    "PROVIDER_FULL" | "PROVIDER_PARTIAL" | "DELIVERY_FULL" | "DELIVERY_PARTIAL"
  >("PROVIDER_PARTIAL")
  const [refundAmount, setRefundAmount] = useState("")
  const [submittingRefund, setSubmittingRefund] = useState(false)

  const refundTargets = useMemo<RefundTarget[]>(() => {
    if (!order) return []

    const targets: RefundTarget[] = order.providerOrders?.map((providerOrder) => ({
      kind: "provider",
      id: providerOrder.id,
      label: `Comercio · ${providerOrder.providerName ?? providerOrder.providerId.slice(0, 6)}`,
      defaultAmount: providerOrder.subtotal,
    })) ?? []

    if (order.deliveryOrder) {
      targets.push({
        kind: "delivery",
        id: order.deliveryOrder.id,
        label: "Reparto",
        defaultAmount: order.deliveryFee,
      })
    }

    return targets
  }, [order])

  const selectedRefundTarget =
    refundTargets.find((target) => target.id === selectedRefundTargetId) ?? null

  const loadSupportData = useCallback(async () => {
    if (!orderId || !isClient) {
      setSupportLoading(false)
      return
    }

    setSupportLoading(true)
    try {
      const loadedOrder = await ordersService.getOne(orderId)
      setOrder(loadedOrder)

      const refundPromises =
        loadedOrder.providerOrders?.map((providerOrder) =>
          refundsService.getProviderOrderRefunds(providerOrder.id),
        ) ?? []

      if (loadedOrder.deliveryOrder) {
        refundPromises.push(
          refundsService.getDeliveryOrderRefunds(loadedOrder.deliveryOrder.id),
        )
        const deliveryIncidents =
          await deliveryIncidentsService.listDeliveryOrderIncidents(
            loadedOrder.deliveryOrder.id,
          )
        setIncidents(deliveryIncidents)
      } else {
        setIncidents([])
      }

      const refundGroups = await Promise.all(refundPromises)
      setRefunds(refundGroups.flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt)))

      const firstTarget =
        (loadedOrder.providerOrders?.[0]
          ? {
              kind: "provider" as const,
              id: loadedOrder.providerOrders[0].id,
              label: loadedOrder.providerOrders[0].providerName ?? loadedOrder.providerOrders[0].id,
              defaultAmount: loadedOrder.providerOrders[0].subtotal,
            }
          : loadedOrder.deliveryOrder
            ? {
                kind: "delivery" as const,
                id: loadedOrder.deliveryOrder.id,
                label: "Reparto",
                defaultAmount: loadedOrder.deliveryFee,
              }
            : null)

      if (firstTarget) {
        setSelectedRefundTargetId((currentTargetId) => currentTargetId || firstTarget.id)
      }
    } catch (error) {
      console.error("Error cargando soporte del pedido:", error)
      toast({
        title: "Error",
        description: "No se pudo cargar el centro de soporte del pedido",
        variant: "destructive",
      })
    } finally {
      setSupportLoading(false)
    }
  }, [isClient, orderId, toast])

  useEffect(() => {
    void loadSupportData()
  }, [loadSupportData])

  useEffect(() => {
    if (!selectedRefundTarget) return
    setRefundType(
      selectedRefundTarget.kind === "delivery"
        ? "DELIVERY_PARTIAL"
        : "PROVIDER_PARTIAL",
    )
    setRefundAmount(selectedRefundTarget.defaultAmount.toFixed(2))
  }, [selectedRefundTarget])

  const submitIncident = async () => {
    if (!order?.deliveryOrder) return

    setSubmittingIncident(true)
    try {
      await deliveryIncidentsService.createIncident({
        deliveryOrderId: order.deliveryOrder.id,
        type: incidentType,
        description: incidentDescription,
        ...(incidentEvidenceUrl.trim()
          ? { evidenceUrl: incidentEvidenceUrl.trim() }
          : {}),
      })
      toast({
        title: "Incidencia registrada",
        description: "El equipo ya puede revisar tu caso",
      })
      setIncidentDescription("")
      setIncidentEvidenceUrl("")
      await loadSupportData()
    } catch (error) {
      console.error(error)
      toast({
        title: "Error",
        description: "No se pudo registrar la incidencia",
        variant: "destructive",
      })
    } finally {
      setSubmittingIncident(false)
    }
  }

  const submitRefund = async () => {
    if (!selectedRefundTarget) return

    setSubmittingRefund(true)
    try {
      await refundsService.requestRefund({
        ...(selectedRefundTarget.kind === "delivery"
          ? { deliveryOrderId: selectedRefundTarget.id }
          : { providerOrderId: selectedRefundTarget.id }),
        type: refundType,
        amount: Number.parseFloat(refundAmount),
        currency: "EUR",
      })
      toast({
        title: "Solicitud de devolución registrada",
        description: "La verás aquí mientras el backoffice la revisa",
      })
      await loadSupportData()
    } catch (error) {
      console.error(error)
      toast({
        title: "Error",
        description: "No se pudo solicitar la devolución",
        variant: "destructive",
      })
    } finally {
      setSubmittingRefund(false)
    }
  }

  return (
    <ProtectedRoute allowedRoles={["CLIENT", "PROVIDER", "RUNNER", "ADMIN"]}>
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <main className="container mx-auto flex-1 px-4 py-8">
          <h1 className="mb-6 text-2xl font-bold">Seguimiento del Pedido #{orderId}</h1>

          <div className="h-[500px] overflow-hidden rounded-xl border border-border">
            <DynamicDeliveryMap
              orderId={orderId}
              initialLat={40.4168}
              initialLng={-3.7038}
              isRunner={isRunner}
            />
          </div>

          {isClient ? (
            <section className="mt-8 rounded-2xl border bg-card p-6">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Centro de soporte del pedido</h2>
                  <p className="text-sm text-muted-foreground">
                    Desde aquí puedes reportar incidencias de entrega y seguir
                    devoluciones abiertas sin perder el contexto del pedido.
                  </p>
                </div>
                <Button type="button" variant="outline" onClick={() => void loadSupportData()}>
                  Actualizar soporte
                </Button>
              </div>

              {supportLoading ? (
                <div className="mt-6 text-sm text-muted-foreground">
                  Cargando incidencias y devoluciones...
                </div>
              ) : (
                <div className="mt-6 grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
                  <div className="space-y-6">
                    <div className="rounded-xl border p-4">
                      <h3 className="text-lg font-semibold">
                        Reportar incidencia de entrega
                      </h3>
                      {!order?.deliveryOrder ? (
                        <p className="mt-3 text-sm text-muted-foreground">
                          Este pedido todavía no tiene reparto asignado, así que
                          no se puede abrir una incidencia de entrega desde aquí.
                        </p>
                      ) : (
                        <div className="mt-4 space-y-3">
                          <label className="block space-y-2 text-sm">
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
                          <label className="block space-y-2 text-sm">
                            <span className="font-medium">Descripción</span>
                            <textarea
                              value={incidentDescription}
                              onChange={(event) =>
                                setIncidentDescription(event.target.value)
                              }
                              placeholder="Describe brevemente qué ha pasado"
                              className="min-h-[120px] w-full rounded-md border bg-background px-3 py-2"
                            />
                          </label>
                          <label className="block space-y-2 text-sm">
                            <span className="font-medium">
                              Evidencia (URL HTTPS, opcional)
                            </span>
                            <input
                              value={incidentEvidenceUrl}
                              onChange={(event) =>
                                setIncidentEvidenceUrl(event.target.value)
                              }
                              placeholder="https://..."
                              className="h-10 w-full rounded-md border bg-background px-3"
                            />
                          </label>
                          <Button
                            type="button"
                            disabled={
                              submittingIncident ||
                              incidentDescription.trim().length < 5
                            }
                            onClick={() => void submitIncident()}
                          >
                            {submittingIncident
                              ? "Registrando incidencia..."
                              : "Registrar incidencia"}
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border p-4">
                      <h3 className="text-lg font-semibold">
                        Solicitar devolución
                      </h3>
                      {refundTargets.length === 0 ? (
                        <p className="mt-3 text-sm text-muted-foreground">
                          Este pedido no tiene todavía un tramo económico
                          reembolsable.
                        </p>
                      ) : (
                        <div className="mt-4 space-y-3">
                          <label className="block space-y-2 text-sm">
                            <span className="font-medium">Qué quieres reclamar</span>
                            <select
                              value={selectedRefundTargetId}
                              onChange={(event) =>
                                setSelectedRefundTargetId(event.target.value)
                              }
                              className="h-10 w-full rounded-md border bg-background px-3"
                            >
                              {refundTargets.map((target) => (
                                <option key={target.id} value={target.id}>
                                  {target.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block space-y-2 text-sm">
                            <span className="font-medium">Tipo de devolución</span>
                            <select
                              value={refundType}
                              onChange={(event) =>
                                setRefundType(
                                  event.target.value as
                                    | "PROVIDER_FULL"
                                    | "PROVIDER_PARTIAL"
                                    | "DELIVERY_FULL"
                                    | "DELIVERY_PARTIAL",
                                )
                              }
                              className="h-10 w-full rounded-md border bg-background px-3"
                            >
                              {refundTypeOptions(selectedRefundTarget).map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block space-y-2 text-sm">
                            <span className="font-medium">Importe</span>
                            <input
                              value={refundAmount}
                              onChange={(event) => setRefundAmount(event.target.value)}
                              inputMode="decimal"
                              className="h-10 w-full rounded-md border bg-background px-3"
                            />
                          </label>
                          <p className="text-xs text-muted-foreground">
                            El backoffice revisará la solicitud antes de aprobarla
                            o rechazarla.
                          </p>
                          <Button
                            type="button"
                            disabled={
                              submittingRefund ||
                              !selectedRefundTarget ||
                              Number.isNaN(Number.parseFloat(refundAmount)) ||
                              Number.parseFloat(refundAmount) <= 0
                            }
                            onClick={() => void submitRefund()}
                          >
                            {submittingRefund
                              ? "Registrando devolución..."
                              : "Solicitar devolución"}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="rounded-xl border p-4">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-lg font-semibold">Incidencias abiertas</h3>
                        <span className="text-sm text-muted-foreground">
                          {incidents.length} casos
                        </span>
                      </div>
                      {incidents.length === 0 ? (
                        <p className="mt-4 text-sm text-muted-foreground">
                          No hay incidencias registradas para este reparto.
                        </p>
                      ) : (
                        <div className="mt-4 space-y-3">
                          {incidents.map((incident) => (
                            <article key={incident.id} className="rounded-lg border p-3">
                              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                                <div>
                                  <p className="font-medium">
                                    {incidentTypeLabel(incident.type)}
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    {incidentStatusLabel(incident.status)} ·{" "}
                                    {new Date(incident.createdAt).toLocaleString("es-ES")}
                                  </p>
                                </div>
                                <span className="text-xs text-muted-foreground">
                                  Reporter: {incident.reporterRole}
                                </span>
                              </div>
                              <p className="mt-2 text-sm">{incident.description}</p>
                            </article>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border p-4">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-lg font-semibold">
                          Devoluciones del pedido
                        </h3>
                        <span className="text-sm text-muted-foreground">
                          {refunds.length} solicitudes
                        </span>
                      </div>
                      {refunds.length === 0 ? (
                        <p className="mt-4 text-sm text-muted-foreground">
                          No hay devoluciones registradas todavía.
                        </p>
                      ) : (
                        <div className="mt-4 space-y-3">
                          {refunds.map((refund) => (
                            <article key={refund.id} className="rounded-lg border p-3">
                              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                                <div>
                                  <p className="font-medium">
                                    {refund.type} · {formatCurrency(refund.amount)}
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    {refundStatusLabel(refund.status)} ·{" "}
                                    {new Date(refund.createdAt).toLocaleString("es-ES")}
                                  </p>
                                </div>
                                <span className="text-xs text-muted-foreground">
                                  {refund.providerOrderId
                                    ? "Comercio"
                                    : refund.deliveryOrderId
                                      ? "Reparto"
                                      : "Mixto"}
                                </span>
                              </div>
                            </article>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </section>
          ) : null}
        </main>
      </div>
    </ProtectedRoute>
  )
}
