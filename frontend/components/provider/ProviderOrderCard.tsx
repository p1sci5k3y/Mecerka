import { Order } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Clock, Store, Package } from "lucide-react"
import { useState } from "react"

interface Props {
    order: Order
    providerOrderId: string
    now: Date
    onStatusChange: (providerOrderId: string, currentStatus: string, nextStatus: string) => Promise<void>
    onReject: (providerOrderId: string) => Promise<void>
}

// Mapa de estados para los Textos/Acciones del Proveedor
const actionMap: Record<string, { label: string | null; nextStatus: string | null; variant: "default" | "destructive" | "outline" | "secondary" }> = {
    PENDING: { label: "Aceptar Pedido", nextStatus: "ACCEPTED", variant: "default" },
    ACCEPTED: { label: "Empezar a Preparar", nextStatus: "PREPARING", variant: "secondary" },
    PREPARING: { label: "Marcar Listo", nextStatus: "READY_FOR_PICKUP", variant: "default" },
    READY_FOR_PICKUP: { label: null, nextStatus: null, variant: "outline" },
}

export function ProviderOrderCard({ order, providerOrderId, now, onStatusChange, onReject }: Props) {
    const [loading, setLoading] = useState(false);
    const po = order.providerOrders?.find((p) => p.id === providerOrderId)
    if (!po) {

        const isMultiStore = (order.providerOrders?.length || 0) > 1

        // Timer: Diferencia entre ahora y el último update (o create)
        const refTime = po.updatedAt || po.createdAt || order.createdAt
        const diffMs = Math.max(0, now.getTime() - new Date(refTime).getTime())
        const diffMins = Math.floor(diffMs / 60000)

        // Botón a mostrar
        const action = actionMap[po.status] || { label: null, nextStatus: null, variant: "outline" }

        return (
            <div className={`flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm transition-all hover:shadow-md 
      ${po.status === 'READY_FOR_PICKUP' ? 'opacity-80' : ''} 
      ${po.status === 'CANCELLED' ? 'opacity-50 grayscale pointer-events-none' : ''}`}>

                {/* HEADER */}
                <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-bold text-muted-foreground">
                        #{order.id.slice(0, 8).toUpperCase()}
                    </span>

                    {/* Chips MultiStore */}
                    {isMultiStore ? (
                        <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
                            <Store className="mr-1 h-3 w-3" /> Compartido
                        </Badge>
                    ) : (
                        <Badge variant="secondary" className="bg-muted text-muted-foreground hover:bg-muted">
                            <Package className="mr-1 h-3 w-3" /> Individual
                        </Badge>
                    )}
                </div>

                {/* ITEMS DE ESTA TIENDA */}
                <div className="rounded-md bg-secondary/30 p-2">
                    <ul className="space-y-1 text-sm">
                        {po.items.map((item) => (
                            <li key={item.id} className="flex items-start justify-between">
                                <span className="font-medium text-foreground">
                                    <span className="mr-2 text-muted-foreground">{item.quantity}x</span>
                                    {item.product?.name || "Producto desconocido"}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>

                {/* DETALLES DE PRECIO Y TIMER */}
                <div className="flex items-center justify-between text-sm text-muted-foreground pt-1">
                    <div className="flex items-center gap-1.5">
                        <Clock className="h-4 w-4" />
                        <span>{diffMins} min</span>
                    </div>
                    <span className="font-bold text-foreground">{po.subtotal.toFixed(2)} €</span>
                </div>

                {/* ACTION BUTTONS */}
                <div className="mt-2 flex items-center justify-end gap-2">
                    {po.status === "PENDING" && (
                        <Button
                            size="sm"
                            variant="destructive"
                            disabled={loading}
                            onClick={async () => {
                                setLoading(true);
                                try {
                                    await onReject(po.id);
                                } finally {
                                    setLoading(false);
                                }
                            }}
                        >
                            Rechazar
                        </Button>
                    )}

                    {action.label && action.nextStatus && (
                        <Button
                            size="sm"
                            variant={action.variant}
                            disabled={loading}
                            onClick={async () => {
                                setLoading(true);
                                try {
                                    await onStatusChange(po.id, po.status, action.nextStatus!);
                                } finally {
                                    setLoading(false);
                                }
                            }}
                        >
                            {action.label}
                        </Button>
                    )}
                </div>
            </div>
        )
    }
