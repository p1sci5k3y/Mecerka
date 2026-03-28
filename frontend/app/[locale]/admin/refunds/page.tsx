"use client"

import { useEffect, useMemo, useState } from "react"
import { AdminNextActionCard } from "@/components/admin/AdminNextActionCard"
import { getAdminRefundQueueNextActionSummary } from "@/components/admin/admin-refund-next-action"
import { adminService } from "@/lib/services/admin-service"
import { Link } from "@/lib/navigation"
import type { AdminRefundSummary } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

const STATUS_FILTERS = [
    { value: "ALL", label: "Todas" },
    { value: "REQUESTED", label: "Solicitadas" },
    { value: "UNDER_REVIEW", label: "En revisión" },
    { value: "APPROVED", label: "Aprobadas" },
    { value: "EXECUTING", label: "Ejecutando" },
    { value: "COMPLETED", label: "Completadas" },
    { value: "REJECTED", label: "Rechazadas" },
    { value: "FAILED", label: "Fallidas" },
] as const

type StatusFilter = typeof STATUS_FILTERS[number]["value"]

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

export default function AdminRefundsPage() {
    const [refunds, setRefunds] = useState<AdminRefundSummary[]>([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [filter, setFilter] = useState<StatusFilter>("ALL")
    const [processingId, setProcessingId] = useState<string | null>(null)
    const { toast } = useToast()

    const fetchRefunds = async () => {
        try {
            const data = await adminService.getRefunds()
            setRefunds(Array.isArray(data) ? data : [])
            setLoadError(null)
        } catch (error) {
            console.error("Error cargando devoluciones:", error)
            setRefunds([])
            setLoadError("No se pudieron cargar las devoluciones.")
            toast({
                title: "Error",
                description: "No se pudieron cargar las devoluciones",
                variant: "destructive",
            })
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        void fetchRefunds()
    }, [])

    const summary = useMemo(() => {
        return {
            requested: refunds.filter((refund) => refund.status === "REQUESTED").length,
            underReview: refunds.filter((refund) => refund.status === "UNDER_REVIEW").length,
            approved: refunds.filter((refund) => refund.status === "APPROVED").length,
            completed: refunds.filter((refund) => refund.status === "COMPLETED").length,
        }
    }, [refunds])

    const filteredRefunds = useMemo(() => {
        if (filter === "ALL") return refunds
        return refunds.filter((refund) => refund.status === filter)
    }, [filter, refunds])
    const nextAction = useMemo(
        () => getAdminRefundQueueNextActionSummary(refunds),
        [refunds],
    )

    const runAction = async (
        refundId: string,
        action: () => Promise<unknown>,
        successTitle: string,
    ) => {
        try {
            setProcessingId(refundId)
            await action()
            toast({ title: successTitle })
            await fetchRefunds()
        } catch (error) {
            console.error("Error procesando devolución:", error)
            toast({
                title: "Error",
                description: "No se pudo actualizar la devolución",
                variant: "destructive",
            })
        } finally {
            setProcessingId(null)
        }
    }

    if (loading) {
        return <div className="p-8">Cargando devoluciones...</div>
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <h1 className="font-display text-3xl font-bold">Devoluciones</h1>
                <p className="text-sm text-muted-foreground">
                    Cola operativa para revisión, aprobación y ejecución de devoluciones en comercios y reparto.
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <SummaryCard label="Solicitadas" value={summary.requested} />
                <SummaryCard label="En revisión" value={summary.underReview} />
                <SummaryCard label="Aprobadas" value={summary.approved} />
                <SummaryCard label="Completadas" value={summary.completed} />
            </div>

            <AdminNextActionCard
                heading="Siguiente acción de backoffice"
                title={nextAction.title}
                description={nextAction.description}
                tone={nextAction.tone}
            />

            <div className="flex flex-wrap gap-2">
                {STATUS_FILTERS.map((status) => (
                    <Button
                        key={status.value}
                        type="button"
                        variant={filter === status.value ? "default" : "outline"}
                        onClick={() => setFilter(status.value)}
                    >
                        {status.label}
                    </Button>
                ))}
                <Button type="button" variant="ghost" onClick={() => void fetchRefunds()}>
                    Refrescar
                </Button>
            </div>

            {loadError ? (
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    {loadError} Se muestra la cola vacía segura mientras el servicio se recupera.
                </div>
            ) : null}

            <div className="rounded-md border bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Solicitud</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead>Importe</TableHead>
                            <TableHead>Solicitante</TableHead>
                            <TableHead>Revisión</TableHead>
                            <TableHead>Creada</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredRefunds.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                                    No hay devoluciones en este estado.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredRefunds.map((refund) => (
                                <TableRow key={refund.id}>
                                    <TableCell>
                                        <div className="space-y-1">
                                            <div className="font-medium">{getRefundBoundary(refund)}</div>
                                            <div className="text-xs text-muted-foreground">
                                                {formatRefundType(refund.type)}
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={getStatusVariant(refund.status)}>
                                            {formatStatus(refund.status)}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>{formatAmount(refund.amount, refund.currency)}</TableCell>
                                    <TableCell>
                                        <div className="space-y-1">
                                            <div className="font-medium">
                                                {refund.requestedByName || "Usuario sin nombre"}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {refund.requestedByEmail}
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {refund.reviewedByEmail ? (
                                            <div className="space-y-1">
                                                <div className="font-medium">
                                                    {refund.reviewedByName || "Administrador"}
                                                </div>
                                                <div className="text-xs text-muted-foreground">
                                                    {refund.reviewedByEmail}
                                                </div>
                                            </div>
                                        ) : (
                                            <span className="text-xs text-muted-foreground">Pendiente</span>
                                        )}
                                    </TableCell>
                                    <TableCell>{formatDate(refund.createdAt)}</TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex flex-wrap justify-end gap-2">
                                            {refund.status === "REQUESTED" && (
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    disabled={processingId === refund.id}
                                                    onClick={() =>
                                                        void runAction(
                                                            refund.id,
                                                            () => adminService.reviewRefund(refund.id),
                                                            "Devolución puesta en revisión",
                                                        )
                                                    }
                                                >
                                                    Revisar
                                                </Button>
                                            )}
                                            <Button type="button" size="sm" variant="outline" asChild>
                                                <Link href={`/admin/refunds/${refund.id}`}>
                                                    Ver caso
                                                </Link>
                                            </Button>
                                            {refund.status === "UNDER_REVIEW" && (
                                                <>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        disabled={processingId === refund.id}
                                                        onClick={() =>
                                                            void runAction(
                                                                refund.id,
                                                                () => adminService.approveRefund(refund.id),
                                                                "Devolución aprobada",
                                                            )
                                                        }
                                                    >
                                                        Aprobar
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="destructive"
                                                        disabled={processingId === refund.id}
                                                        onClick={() =>
                                                            void runAction(
                                                                refund.id,
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
                                                    type="button"
                                                    size="sm"
                                                    disabled={processingId === refund.id}
                                                    onClick={() =>
                                                        void runAction(
                                                            refund.id,
                                                            () => adminService.executeRefund(refund.id),
                                                            "Devolución ejecutada",
                                                        )
                                                    }
                                                >
                                                    Ejecutar
                                                </Button>
                                            )}
                                            {["COMPLETED", "REJECTED", "FAILED", "EXECUTING"].includes(refund.status) && (
                                                <span className="text-xs text-muted-foreground">
                                                    Sin acciones manuales
                                                </span>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}

function SummaryCard({ label, value }: { label: string; value: number }) {
    return (
        <div className="rounded-xl border bg-card p-5 shadow-sm">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="mt-2 font-display text-3xl font-bold">{value}</p>
        </div>
    )
}
