import React from "react"
import type { Order } from "@/lib/types"
import { ProviderOrderCard } from "./ProviderOrderCard"

interface Props {
    title: string
    icon: React.ReactNode
    orders: Order[]
    providerId: string // Current logged in provider userId
    validStatuses: string[]
    now: Date
    onStatusChange: (providerOrderId: string, currentStatus: string, nextStatus: string) => Promise<void>
    onReject: (providerOrderId: string) => Promise<void>
}

export function OrderKanbanColumn({
    title,
    icon,
    orders,
    providerId,
    validStatuses,
    now,
    onStatusChange,
    onReject,
}: Props) {
    // Filtra los pedidos globales para dejar solo aquellos cuyo providerOrder (de este proveedor)
    // coincida con un estado válido para esta columna.
    const columnOrders = orders.filter((order) => {
        const providerOrder = order.providerOrders?.find((po) => po.providerId === providerId)
        if (!providerOrder) return false
        return validStatuses.includes(providerOrder.status)
    })

    // Evita que la Kanban renderice columnas vacías sin diseño
    return (
        <div className="flex flex-col gap-4 rounded-xl bg-muted/50 p-4 w-full min-h-[60vh] border border-border">
            <div className="flex items-center justify-between">
                <h3 className="flex items-center font-display text-lg font-bold gap-2 text-foreground">
                    {icon}
                    {title}
                </h3>
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-background text-sm font-medium shadow-sm">
                    {columnOrders.length}
                </span>
            </div>

            <div className="flex flex-col gap-3">
                {columnOrders.length === 0 ? (
                    <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border text-center text-sm text-muted-foreground">
                        No hay pedidos
                    </div>
                ) : (
                    columnOrders.map((order) => {
                        const po = order.providerOrders?.find((po) => po.providerId === providerId)
                        return (
                            <div
                                key={po!.id}
                                className="transition-all animate-in slide-in-from-bottom-2 fade-in"
                            >
                                <ProviderOrderCard
                                    order={order}
                                    providerOrderId={po!.id}
                                    now={now}
                                    onStatusChange={onStatusChange}
                                    onReject={onReject}
                                />
                            </div>
                        )
                    })
                )}
            </div>
        </div>
    )
}
