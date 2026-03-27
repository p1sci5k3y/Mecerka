"use client"

import { useEffect, useMemo, useState } from "react"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { ProtectedRoute } from "@/components/protected-route"
import { Button } from "@/components/ui/button"
import { Link } from "@/lib/navigation"
import { deliveryIncidentsService } from "@/lib/services/delivery-incidents-service"
import { refundsService } from "@/lib/services/refunds-service"
import type { DeliveryIncidentSummary, RefundSummary } from "@/lib/types"
import {
  ArrowRight,
  CircleDollarSign,
  LifeBuoy,
  Loader2,
  PackageSearch,
  ShieldAlert,
} from "lucide-react"

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
      return "Ejecutándose"
    case "COMPLETED":
      return "Completada"
    case "FAILED":
      return "Fallida"
    default:
      return status
  }
}

function refundTypeLabel(type: RefundSummary["type"]) {
  switch (type) {
    case "PROVIDER_FULL":
      return "Devolución completa de comercio"
    case "PROVIDER_PARTIAL":
      return "Devolución parcial de comercio"
    case "DELIVERY_FULL":
      return "Devolución completa de reparto"
    case "DELIVERY_PARTIAL":
      return "Devolución parcial de reparto"
    default:
      return type
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
      return "Otra incidencia"
    default:
      return type
  }
}

function isOpenIncident(status: DeliveryIncidentSummary["status"]) {
  return status === "OPEN" || status === "UNDER_REVIEW"
}

function isOpenRefund(status: RefundSummary["status"]) {
  return (
    status === "REQUESTED" ||
    status === "UNDER_REVIEW" ||
    status === "APPROVED" ||
    status === "EXECUTING"
  )
}

function formatCurrency(amount: number, currency: string) {
  return amount.toLocaleString("es-ES", {
    style: "currency",
    currency,
  })
}

export default function ProfileSupportPage() {
  return (
    <ProtectedRoute allowedRoles={["CLIENT"]}>
      <ProfileSupportContent />
    </ProtectedRoute>
  )
}

function ProfileSupportContent() {
  const [incidents, setIncidents] = useState<DeliveryIncidentSummary[]>([])
  const [refunds, setRefunds] = useState<RefundSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      try {
        const [incidentData, refundData] = await Promise.all([
          deliveryIncidentsService.listMyIncidents(),
          refundsService.getMyRefunds(),
        ])
        setIncidents(incidentData)
        setRefunds(refundData)
      } catch (error) {
        console.error("Error loading support center:", error)
      } finally {
        setLoading(false)
      }
    }

    void loadData()
  }, [])

  const openIncidents = useMemo(
    () => incidents.filter((incident) => isOpenIncident(incident.status)),
    [incidents],
  )
  const openRefunds = useMemo(
    () => refunds.filter((refund) => isOpenRefund(refund.status)),
    [refunds],
  )
  const closedCases = useMemo(
    () =>
      incidents.filter((incident) => !isOpenIncident(incident.status)).length +
      refunds.filter((refund) => !isOpenRefund(refund.status)).length,
    [incidents, refunds],
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
        <div className="mx-auto flex max-w-6xl flex-col gap-8">
          <div className="flex flex-col gap-3">
            <h1 className="font-display text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
              Soporte y devoluciones
            </h1>
            <p className="max-w-3xl text-lg text-muted-foreground">
              Aquí ves todas las incidencias y devoluciones ligadas a tus pedidos, con salida directa al pedido y su seguimiento.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Incidencias abiertas
              </p>
              <p className="mt-3 text-3xl font-extrabold text-foreground">
                {openIncidents.length}
              </p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Devoluciones activas
              </p>
              <p className="mt-3 text-3xl font-extrabold text-foreground">
                {openRefunds.length}
              </p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Casos cerrados
              </p>
              <p className="mt-3 text-3xl font-extrabold text-foreground">
                {closedCases}
              </p>
            </div>
          </div>

          <section className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-foreground">Incidencias</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Incidencias logísticas o de entrega abiertas desde tus pedidos.
                </p>
              </div>
              <Button asChild variant="outline">
                <Link href="/orders">Ver mis pedidos</Link>
              </Button>
            </div>

            {incidents.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-dashed border-border/70 bg-background/70 px-6 py-14 text-center">
                <ShieldAlert className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <p className="mt-4 font-semibold text-foreground">
                  No tienes incidencias registradas ahora mismo.
                </p>
              </div>
            ) : (
              <div className="mt-6 grid gap-4">
                {incidents.map((incident) => (
                  <article
                    key={incident.id}
                    className="rounded-2xl border border-border/60 bg-background/70 p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                          {incidentTypeLabel(incident.type)}
                        </p>
                        <h3 className="text-lg font-bold text-foreground">
                          {incident.description}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          Estado: {incidentStatusLabel(incident.status)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        {incident.orderId ? (
                          <>
                            <Button asChild variant="outline">
                              <Link href={`/orders/${incident.orderId}`}>
                                Ver pedido
                              </Link>
                            </Button>
                            <Button asChild>
                              <Link href={`/orders/${incident.orderId}/track`}>
                                Seguir pedido
                              </Link>
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <CircleDollarSign className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-bold text-foreground">Devoluciones</h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Solicitudes ligadas a comercio o reparto con su estado de revisión.
            </p>

            {refunds.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-dashed border-border/70 bg-background/70 px-6 py-14 text-center">
                <PackageSearch className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <p className="mt-4 font-semibold text-foreground">
                  No tienes devoluciones registradas ahora mismo.
                </p>
              </div>
            ) : (
              <div className="mt-6 grid gap-4">
                {refunds.map((refund) => (
                  <article
                    key={refund.id}
                    className="rounded-2xl border border-border/60 bg-background/70 p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                          {refundTypeLabel(refund.type)}
                        </p>
                        <h3 className="text-lg font-bold text-foreground">
                          {formatCurrency(refund.amount, refund.currency)}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          Estado: {refundStatusLabel(refund.status)}
                        </p>
                      </div>
                      {refund.orderId ? (
                        <div className="flex flex-wrap gap-3">
                          <Button asChild variant="outline">
                            <Link href={`/orders/${refund.orderId}`}>
                              Ver pedido
                            </Link>
                          </Button>
                          <Button asChild>
                            <Link href={`/orders/${refund.orderId}/track`}>
                              Ir al soporte del pedido
                            </Link>
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-primary/10 p-3 text-primary">
                  <LifeBuoy className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-foreground">
                    Abrir un caso nuevo
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Las incidencias y devoluciones nuevas se siguen abriendo desde el seguimiento del pedido para no perder el contexto operativo.
                  </p>
                </div>
              </div>
              <Button asChild variant="outline">
                <Link href="/orders">
                  Ir al centro de pedidos
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
