"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Link } from "@/lib/navigation"
import { adminService } from "@/lib/services/admin-service"
import type { AdminIncidentSummary } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import { AlertTriangle, ArrowLeft, Camera, ExternalLink, Route, ShoppingBag, UserRound } from "lucide-react"

function formatDate(value: string | null) {
  if (!value) return "Sin fecha"
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value))
}

function formatStatus(status: string) {
  return status
    .toLowerCase()
    .split("_")
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ")
}

function formatType(type: string) {
  return type
    .toLowerCase()
    .split("_")
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ")
}

function getStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "RESOLVED":
      return "default"
    case "REJECTED":
      return "destructive"
    case "UNDER_REVIEW":
      return "secondary"
    default:
      return "outline"
  }
}

function buildIncidentLinks(incident: AdminIncidentSummary) {
  return [
    {
      href: `/orders/${incident.orderId}`,
      label: "Ver pedido cliente",
      icon: ShoppingBag,
    },
    {
      href: `/runner/orders/${incident.deliveryOrderId}`,
      label: "Ver entrega de reparto",
      icon: Route,
    },
  ]
}

export default function AdminIncidentDetailPage() {
  const params = useParams<{ id: string }>()
  const incidentId = typeof params.id === "string" ? params.id : ""
  const [incident, setIncident] = useState<AdminIncidentSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const { toast } = useToast()

  const loadIncident = async () => {
    if (!incidentId) {
      setLoading(false)
      return
    }

    try {
      const data = await adminService.getIncident(incidentId)
      setIncident(data)
    } catch (error) {
      console.error("Error loading incident detail:", error)
      setIncident(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadIncident()
  }, [incidentId])

  const runAction = async (action: () => Promise<unknown>, successTitle: string) => {
    try {
      setProcessing(true)
      await action()
      toast({ title: successTitle })
      await loadIncident()
    } catch (error) {
      console.error("Error updating incident:", error)
      toast({
        title: "Error",
        description: "No se pudo actualizar la incidencia",
        variant: "destructive",
      })
    } finally {
      setProcessing(false)
    }
  }

  if (loading) {
    return <div className="p-8">Cargando incidencia...</div>
  }

  if (!incident) {
    return (
      <div className="space-y-4">
        <Button asChild variant="outline">
          <Link href="/admin/incidents">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a incidencias
          </Link>
        </Button>
        <div className="rounded-xl border bg-card p-6 text-destructive">
          No pudimos cargar este caso de incidencia.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <Button asChild variant="outline">
            <Link href="/admin/incidents">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver a incidencias
            </Link>
          </Button>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              Incident #{incident.id.slice(0, 8).toUpperCase()}
            </p>
            <h1 className="font-display text-3xl font-bold">Caso de incidencia</h1>
          </div>
        </div>
        <Badge variant={getStatusVariant(incident.status)}>{formatStatus(incident.status)}</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Entrega" value={incident.deliveryOrderId} />
        <SummaryCard label="Tipo" value={formatType(incident.type)} />
        <SummaryCard label="Alta" value={formatDate(incident.createdAt)} />
        <SummaryCard label="Resolución" value={formatDate(incident.resolvedAt)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.15fr,0.85fr]">
        <section className="space-y-6">
          <div className="rounded-xl border bg-card p-6">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Lectura operativa</h2>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">{incident.description}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              {incident.status === "OPEN" && (
                <Button
                  disabled={processing}
                  onClick={() =>
                    void runAction(
                      () => adminService.reviewIncident(incident.id),
                      "Incidencia puesta en revisión",
                    )
                  }
                >
                  Revisar
                </Button>
              )}
              {incident.status === "UNDER_REVIEW" && (
                <>
                  <Button
                    disabled={processing}
                    onClick={() =>
                      void runAction(
                        () => adminService.resolveIncident(incident.id),
                        "Incidencia resuelta",
                      )
                    }
                  >
                    Resolver
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={processing}
                    onClick={() =>
                      void runAction(
                        () => adminService.rejectIncident(incident.id),
                        "Incidencia rechazada",
                      )
                    }
                  >
                    Rechazar
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="rounded-xl border bg-card p-6">
            <div className="flex items-center gap-2">
              <Route className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Timeline del caso</h2>
            </div>
            <dl className="mt-5 space-y-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Creada</dt>
                <dd className="font-medium">{formatDate(incident.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Resuelta</dt>
                <dd className="font-medium">{formatDate(incident.resolvedAt)}</dd>
              </div>
            </dl>
          </div>
        </section>

        <aside className="space-y-6">
          <div className="rounded-xl border bg-card p-6">
            <div className="flex items-center gap-2">
              <ExternalLink className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Saltos de contexto</h2>
            </div>
            <div className="mt-5 flex flex-col gap-2">
              {buildIncidentLinks(incident).map((link) => {
                const Icon = link.icon
                return (
                  <Button key={link.href} asChild variant="outline" className="justify-start">
                    <Link href={link.href}>
                      <Icon className="mr-2 h-4 w-4" />
                      {link.label}
                    </Link>
                  </Button>
                )
              })}
            </div>
          </div>

          <div className="rounded-xl border bg-card p-6">
            <div className="flex items-center gap-2">
              <UserRound className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Reporter</h2>
            </div>
            <div className="mt-5 space-y-3 text-sm">
              <p className="font-medium">{incident.reporterName || "Usuario sin nombre"}</p>
              <p className="text-muted-foreground">{incident.reporterEmail}</p>
              <p className="text-muted-foreground">{incident.reporterRole}</p>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-6">
            <div className="flex items-center gap-2">
              <Camera className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Evidencia</h2>
            </div>
            <div className="mt-5 text-sm">
              {incident.evidenceUrl ? (
                <a
                  href={incident.evidenceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline"
                >
                  Ver evidencia
                </a>
              ) : (
                <p className="text-muted-foreground">Sin evidencia adjunta</p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 font-semibold text-foreground">{value}</p>
    </div>
  )
}
