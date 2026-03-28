"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { AdminNextActionCard } from "@/components/admin/AdminNextActionCard"
import { getAdminRefundCaseNextActionSummary } from "@/components/admin/admin-refund-next-action"
import { Link } from "@/lib/navigation"
import { adminService } from "@/lib/services/admin-service"
import type { AdminRefundSummary } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import { ArrowLeft, CreditCard, ExternalLink, HandCoins, Receipt, Route, ShoppingBag, UserRound } from "lucide-react"

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
  }).format(amount)
}

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

function formatRefundType(type: string) {
  return type
    .replace("PROVIDER_", "Comercio ")
    .replace("DELIVERY_", "Reparto ")
    .replace("FULL", "completo")
    .replace("PARTIAL", "parcial")
}

function getRefundBoundary(refund: AdminRefundSummary) {
  if (refund.providerOrderId) return `Comercio ${refund.providerOrderId}`
  if (refund.deliveryOrderId) return `Reparto ${refund.deliveryOrderId}`
  if (refund.incidentId) return `Incidencia ${refund.incidentId}`
  return "Sin límite económico"
}

function getStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "COMPLETED":
      return "default"
    case "REJECTED":
    case "FAILED":
      return "destructive"
    case "UNDER_REVIEW":
    case "APPROVED":
    case "EXECUTING":
      return "secondary"
    default:
      return "outline"
  }
}

function buildRefundLinks(refund: AdminRefundSummary) {
  return [
    refund.orderId
      ? {
          href: `/orders/${refund.orderId}`,
          label: "Ver pedido cliente",
          icon: ShoppingBag,
        }
      : null,
    refund.providerOrderId
      ? {
          href: `/provider/sales/${refund.providerOrderId}`,
          label: "Ver venta de comercio",
          icon: CreditCard,
        }
      : null,
    refund.deliveryOrderId
      ? {
          href: `/runner/orders/${refund.orderId || refund.deliveryOrderId}`,
          label: "Ver entrega de reparto",
          icon: Route,
        }
      : null,
    refund.incidentId
      ? {
          href: `/admin/incidents/${refund.incidentId}`,
          label: "Ver incidencia origen",
          icon: ExternalLink,
        }
      : null,
  ].filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
}

export default function AdminRefundDetailPage() {
  const params = useParams<{ id: string }>()
  const refundId = typeof params.id === "string" ? params.id : ""
  const [refund, setRefund] = useState<AdminRefundSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const { toast } = useToast()
  const contextLinks = refund ? buildRefundLinks(refund) : []
  const nextAction = refund ? getAdminRefundCaseNextActionSummary(refund) : null

  const loadRefund = async () => {
    if (!refundId) {
      setLoading(false)
      return
    }

    try {
      const data = await adminService.getRefund(refundId)
      setRefund(data)
    } catch (error) {
      console.error("Error loading refund detail:", error)
      setRefund(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadRefund()
  }, [refundId])

  const runAction = async (action: () => Promise<unknown>, successTitle: string) => {
    try {
      setProcessing(true)
      await action()
      toast({ title: successTitle })
      await loadRefund()
    } catch (error) {
      console.error("Error updating refund:", error)
      toast({
        title: "Error",
        description: "No se pudo actualizar la devolución",
        variant: "destructive",
      })
    } finally {
      setProcessing(false)
    }
  }

  if (loading) {
    return <div className="p-8">Cargando devolución...</div>
  }

  if (!refund) {
    return (
      <div className="space-y-4">
        <Button asChild variant="outline">
          <Link href="/admin/refunds">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a devoluciones
          </Link>
        </Button>
        <div className="rounded-xl border bg-card p-6 text-destructive">
          No pudimos cargar este caso de devolución.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <Button asChild variant="outline">
            <Link href="/admin/refunds">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver a devoluciones
            </Link>
          </Button>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              Refund #{refund.id.slice(0, 8).toUpperCase()}
            </p>
            <h1 className="font-display text-3xl font-bold">Caso de devolución</h1>
          </div>
        </div>
        <Badge variant={getStatusVariant(refund.status)}>{formatStatus(refund.status)}</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Boundary" value={getRefundBoundary(refund)} />
        <SummaryCard label="Tipo" value={formatRefundType(refund.type)} />
        <SummaryCard label="Importe" value={formatAmount(refund.amount, refund.currency)} />
        <SummaryCard label="Creada" value={formatDate(refund.createdAt)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.15fr,0.85fr]">
        <section className="space-y-6">
          <div className="rounded-xl border bg-card p-6">
            <div className="flex items-center gap-2">
              <HandCoins className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Lectura operativa</h2>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Este caso resume la solicitud económica, el alcance del reembolso y el punto exacto del flujo administrativo.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {refund.status === "REQUESTED" && (
                <Button
                  disabled={processing}
                  onClick={() =>
                    void runAction(
                      () => adminService.reviewRefund(refund.id),
                      "Devolución puesta en revisión",
                    )
                  }
                >
                  Revisar
                </Button>
              )}
              {refund.status === "UNDER_REVIEW" && (
                <>
                  <Button
                    disabled={processing}
                    onClick={() =>
                      void runAction(
                        () => adminService.approveRefund(refund.id),
                        "Devolución aprobada",
                      )
                    }
                  >
                    Aprobar
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={processing}
                    onClick={() =>
                      void runAction(
                        () => adminService.rejectRefund(refund.id),
                        "Devolución rechazada",
                      )
                    }
                  >
                    Rechazar
                  </Button>
                </>
              )}
              {refund.status === "APPROVED" && (
                <Button
                  disabled={processing}
                  onClick={() =>
                    void runAction(
                      () => adminService.executeRefund(refund.id),
                      "Devolución ejecutada",
                    )
                  }
                >
                  Ejecutar
                </Button>
              )}
            </div>
          </div>

          <div className="rounded-xl border bg-card p-6">
            <div className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Timeline económica</h2>
            </div>
            <dl className="mt-5 space-y-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Solicitada</dt>
                <dd className="font-medium">{formatDate(refund.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Revisada</dt>
                <dd className="font-medium">{formatDate(refund.reviewedAt)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Completada</dt>
                <dd className="font-medium">{formatDate(refund.completedAt)}</dd>
              </div>
            </dl>
          </div>
        </section>

        <aside className="space-y-6">
          {nextAction ? (
            <AdminNextActionCard
              heading="Siguiente acción de backoffice"
              title={nextAction.title}
              description={nextAction.description}
              tone={nextAction.tone}
            />
          ) : null}

          <div className="rounded-xl border bg-card p-6">
            <div className="flex items-center gap-2">
              <ExternalLink className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Saltos de contexto</h2>
            </div>
            <div className="mt-5 flex flex-col gap-2">
              {contextLinks.map((link) => {
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
              {contextLinks.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Este caso no expone saltos de contexto adicionales.
                </p>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border bg-card p-6">
            <div className="flex items-center gap-2">
              <UserRound className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Solicitante</h2>
            </div>
            <div className="mt-5 space-y-3 text-sm">
              <p className="font-medium">{refund.requestedByName || "Usuario sin nombre"}</p>
              <p className="text-muted-foreground">{refund.requestedByEmail}</p>
              <p className="text-muted-foreground">ID: {refund.requestedById}</p>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-6">
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Revisión y ejecución</h2>
            </div>
            <div className="mt-5 space-y-3 text-sm">
              <p className="text-muted-foreground">
                Revisor:{" "}
                <span className="font-medium text-foreground">
                  {refund.reviewedByName || refund.reviewedByEmail || "Pendiente"}
                </span>
              </p>
              <p className="text-muted-foreground">
                External refund:{" "}
                <span className="font-medium text-foreground">
                  {refund.externalRefundId || "Sin referencia externa"}
                </span>
              </p>
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
