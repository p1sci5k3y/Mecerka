import { Order } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { MapPin, Coins, Navigation, CheckCircle2, ChevronRight, Store, Box, Clock } from "lucide-react"

interface Props {
    order: Order
    onInTransit: (id: string) => Promise<void>
    onComplete: (id: string) => Promise<void>
    disabled?: boolean
}

// Helper to resolve the visual label of a ProviderOrder from the Runner's perspective
function getPickupStatusLabel(poStatus: string) {
    switch (poStatus) {
        case "PICKED_UP":
            return { text: "Recogido ✅", color: "text-green-600", bg: "bg-green-100" };
        case "READY_FOR_PICKUP":
            return { text: "Listo para recoger", color: "text-blue-600", bg: "bg-blue-100" };
        case "PREPARING":
        case "ACCEPTED":
        case "PENDING":
            return { text: "En preparación", color: "text-yellow-600", bg: "bg-yellow-100" };
        case "REJECTED_BY_STORE":
        case "CANCELLED":
            return { text: "No aplica", color: "text-muted-foreground", bg: "bg-muted" };
        default:
            return { text: "Desconocido", color: "text-muted-foreground", bg: "bg-muted" };
    }
}

export function RunnerActiveOrderView({ order, onInTransit, onComplete, disabled }: Props) {
    // Derive lists and states purely from Backend Source of Truth
    const activeProviderOrders = (order.providerOrders || []).filter(
        (po) => po.status !== "CANCELLED" && po.status !== "REJECTED_BY_STORE"
    )

    const pickedUpCount = activeProviderOrders.filter((po) => po.status === "PICKED_UP").length
    const totalActive = activeProviderOrders.length

    const allPickedUp = totalActive > 0 && pickedUpCount === totalActive

    // Overall distance/fee metadata equivalent to card (dummy values if actual aren't passed)
    const estDistanceMs = order.id.charCodeAt(0) % 5 + 1.5

    return (
        <div className="flex flex-col gap-6 w-full max-w-2xl mx-auto">
            {/* 
        HEADER SUMMARY 
      */}
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <Badge variant="default" className="bg-primary/10 text-primary hover:bg-primary/20 mb-2">
                            Modo Ruta Activa
                        </Badge>
                        <h2 className="font-display text-2xl font-bold">
                            Pedido #{order.id.slice(0, 8).toUpperCase()}
                        </h2>
                    </div>
                    <div className="text-right">
                        <p className="font-display text-2xl font-black text-green-600">
                            {order.deliveryFee.toFixed(2)} €
                        </p>
                        <p className="text-sm font-semibold text-muted-foreground flex items-center justify-end gap-1">
                            <MapPin className="h-3 w-3" /> ~{estDistanceMs.toFixed(1)} km
                        </p>
                    </div>
                </div>
            </div>

            {/* 
        PASO 1 & 2: RECOGIDAS (Only show if ASSIGNED. If IN_TRANSIT, we've already picked up)
      */}
            {order.status === "ASSIGNED" && (
                <div className="rounded-2xl border border-primary/20 bg-card p-6 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-primary/40"></div>

                    <h3 className="font-display text-lg font-bold mb-4 flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm">1</span>
                        Ruta de Recogida
                    </h3>

                    <div className="space-y-3 mb-6">
                        {activeProviderOrders.map((po, idx) => {
                            const labelState = getPickupStatusLabel(po.status)
                            // Guess store name from items since ProviderOrder doesn't natively bring store name in our lightweight map
                            const storeName = po.items[0]?.product?.providerId || `Tienda Asociada ${idx + 1}`

                            return (
                                <div key={po.id} className="flex items-center justify-between rounded-xl border border-border/80 bg-muted/20 p-4">
                                    <div className="flex items-center gap-3">
                                        <Store className="h-5 w-5 text-muted-foreground" />
                                        <div>
                                            <p className="font-semibold text-foreground">{po.items[0]?.product?.provider?.name || storeName}</p>
                                            <p className="text-xs text-muted-foreground font-mono">{po.id.slice(0, 8)}</p>
                                        </div>
                                    </div>
                                    <Badge variant="secondary" className={`${labelState.bg} ${labelState.color} hover:${labelState.bg} border-0`}>
                                        {labelState.text}
                                    </Badge>
                                </div>
                            )
                        })}
                    </div>

                    <div className="pt-4 border-t border-border/50">
                        {allPickedUp ? (
                            <Button
                                onClick={() => onInTransit(order.id)}
                                disabled={disabled}
                                className="w-full h-12 text-base font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
                            >
                                Todas las bolsas listas. Iniciar Entrega <ChevronRight className="ml-2 h-5 w-5" />
                            </Button>
                        ) : (
                            <div className="rounded-xl bg-orange-50 border border-orange-200 p-4 text-center">
                                <p className="text-orange-800 font-medium text-sm flex items-center justify-center gap-2">
                                    <Clock className="h-4 w-4" />
                                    Pendiente de confirmación de recogida por las tiendas ({pickedUpCount}/{totalActive})
                                </p>
                                <p className="text-orange-600/80 text-xs mt-1">El botón de entrega se activará automáticamente al completarse.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* 
        PASO 3: ENTREGA AL CLIENTE (Only show if IN_TRANSIT)
      */}
            {order.status === "IN_TRANSIT" && (
                <div className="rounded-2xl border border-green-500/20 bg-card p-6 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-green-500"></div>

                    <h3 className="font-display text-lg font-bold mb-4 flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-white text-sm">2</span>
                        Entrega al Cliente
                    </h3>

                    <div className="rounded-xl border border-border/80 bg-muted/20 p-6 mb-6">
                        <div className="flex items-start gap-4">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background border border-border shadow-sm">
                                <Navigation className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1">Dirección Exacta</p>
                                <p className="text-lg font-bold text-foreground leading-tight">
                                    {order.deliveryAddress || `${order.city} (Centro)`}
                                </p>
                                <p className="text-sm text-foreground/80 mt-2 flex items-center gap-2">
                                    <Box className="h-4 w-4" /> Entregar {totalActive} paquete(s)
                                </p>
                            </div>
                        </div>
                    </div>

                    <Button
                        onClick={() => onComplete(order.id)}
                        disabled={disabled}
                        className="w-full h-14 text-lg font-bold bg-green-600 hover:bg-green-700 text-white shadow-md transition-transform active:scale-[0.98]"
                    >
                        <CheckCircle2 className="mr-2 h-6 w-6" /> Marcar Entregado
                    </Button>
                </div>
            )}
        </div>
    )
}
