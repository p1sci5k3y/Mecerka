"use client"

import { useEffect, useMemo, useState } from "react"
import { adminService } from "@/lib/services/admin-service"
import type { AdminIncidentSummary } from "@/lib/types"
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
    { value: "OPEN", label: "Abiertas" },
    { value: "UNDER_REVIEW", label: "En revisión" },
    { value: "RESOLVED", label: "Resueltas" },
    { value: "REJECTED", label: "Rechazadas" },
] as const

type StatusFilter = typeof STATUS_FILTERS[number]["value"]

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

export default function AdminIncidentsPage() {
    const [incidents, setIncidents] = useState<AdminIncidentSummary[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState<StatusFilter>("ALL")
    const [processingId, setProcessingId] = useState<string | null>(null)
    const { toast } = useToast()

    const fetchIncidents = async () => {
        try {
            const data = await adminService.getIncidents()
            setIncidents(data)
        } catch (error) {
            console.error("Error cargando incidencias:", error)
            toast({
                title: "Error",
                description: "No se pudieron cargar las incidencias",
                variant: "destructive",
            })
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        void fetchIncidents()
    }, [])

    const summary = useMemo(() => {
        return {
            open: incidents.filter((incident) => incident.status === "OPEN").length,
            underReview: incidents.filter((incident) => incident.status === "UNDER_REVIEW").length,
            resolved: incidents.filter((incident) => incident.status === "RESOLVED").length,
            rejected: incidents.filter((incident) => incident.status === "REJECTED").length,
        }
    }, [incidents])

    const filteredIncidents = useMemo(() => {
        if (filter === "ALL") return incidents
        return incidents.filter((incident) => incident.status === filter)
    }, [filter, incidents])

    const runAction = async (
        incidentId: string,
        action: () => Promise<unknown>,
        successTitle: string,
    ) => {
        try {
            setProcessingId(incidentId)
            await action()
            toast({ title: successTitle })
            await fetchIncidents()
        } catch (error) {
            console.error("Error procesando incidencia:", error)
            toast({
                title: "Error",
                description: "No se pudo actualizar la incidencia",
                variant: "destructive",
            })
        } finally {
            setProcessingId(null)
        }
    }

    if (loading) {
        return <div className="p-8">Cargando incidencias...</div>
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <h1 className="font-display text-3xl font-bold">Incidencias</h1>
                <p className="text-sm text-muted-foreground">
                    Cola operativa de incidencias de reparto para revisión, resolución o rechazo desde backoffice.
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <SummaryCard label="Abiertas" value={summary.open} />
                <SummaryCard label="En revisión" value={summary.underReview} />
                <SummaryCard label="Resueltas" value={summary.resolved} />
                <SummaryCard label="Rechazadas" value={summary.rejected} />
            </div>

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
                <Button type="button" variant="ghost" onClick={() => void fetchIncidents()}>
                    Refrescar
                </Button>
            </div>

            <div className="rounded-md border bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Incidencia</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead>Reporter</TableHead>
                            <TableHead>Descripción</TableHead>
                            <TableHead>Alta</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredIncidents.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                                    No hay incidencias en este estado.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredIncidents.map((incident) => (
                                <TableRow key={incident.id}>
                                    <TableCell>
                                        <div className="space-y-1">
                                            <div className="font-medium">Entrega {incident.deliveryOrderId}</div>
                                            <div className="text-xs text-muted-foreground">{formatType(incident.type)}</div>
                                            {incident.evidenceUrl ? (
                                                <a
                                                    href={incident.evidenceUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-xs text-primary underline"
                                                >
                                                    Ver evidencia
                                                </a>
                                            ) : null}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={getStatusVariant(incident.status)}>
                                            {formatStatus(incident.status)}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="space-y-1">
                                            <div className="font-medium">
                                                {incident.reporterName || "Usuario sin nombre"}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {incident.reporterRole} · {incident.reporterEmail}
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="max-w-md text-sm text-muted-foreground">
                                            {incident.description}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="space-y-1">
                                            <div>{formatDate(incident.createdAt)}</div>
                                            <div className="text-xs text-muted-foreground">
                                                Resuelta: {formatDate(incident.resolvedAt)}
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex flex-wrap justify-end gap-2">
                                            {incident.status === "OPEN" && (
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    disabled={processingId === incident.id}
                                                    onClick={() =>
                                                        void runAction(
                                                            incident.id,
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
                                                        type="button"
                                                        size="sm"
                                                        disabled={processingId === incident.id}
                                                        onClick={() =>
                                                            void runAction(
                                                                incident.id,
                                                                () => adminService.resolveIncident(incident.id),
                                                                "Incidencia resuelta",
                                                            )
                                                        }
                                                    >
                                                        Resolver
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="destructive"
                                                        disabled={processingId === incident.id}
                                                        onClick={() =>
                                                            void runAction(
                                                                incident.id,
                                                                () => adminService.rejectIncident(incident.id),
                                                                "Incidencia rechazada",
                                                            )
                                                        }
                                                    >
                                                        Rechazar
                                                    </Button>
                                                </>
                                            )}
                                            {["RESOLVED", "REJECTED"].includes(incident.status) && (
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
