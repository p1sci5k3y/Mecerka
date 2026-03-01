import { Order } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { MapPin, Coins, Store, Clock, Route } from "lucide-react"

interface Props {
    order: Order
    onAccept: (id: string) => Promise<void>
    disabled?: boolean
}

export function RunnerOrderCard({ order, onAccept, disabled }: Props) {
    const isMultiStop = order.providerOrders.length > 1
    const storeCount = order.providerOrders.length

    // Dummy estimations calculated from sub-params (avoiding real API calls for now)
    const estDistanceMs = order.id.charCodeAt(0) % 5 + 1.5 // e.g. 2.5 km
    const estMins = Math.round(estDistanceMs * 4) + (storeCount * 3)

    return (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border/50 pb-3">
                <span className="font-mono text-sm font-bold text-muted-foreground">
                    #{order.id.slice(0, 8).toUpperCase()}
                </span>

                {isMultiStop ? (
                    <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100 px-2 py-0.5">
                        <Route className="mr-1 h-3 w-3" />
                        Ruta Multi-Pickup
                    </Badge>
                ) : (
                    <Badge variant="secondary" className="bg-muted text-muted-foreground px-2 py-0.5">
                        <Store className="mr-1 h-3 w-3" />
                        Parada Única
                    </Badge>
                )}
            </div>

            {/* Grid details */}
            <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm mt-1">
                <div className="flex items-center gap-2 text-muted-foreground">
                    <Store className="h-4 w-4 shrink-0 text-primary/70" />
                    <span className="font-medium text-foreground">
                        {storeCount} Tienda{storeCount > 1 ? 's' : ''}
                    </span>
                </div>

                <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4 shrink-0 text-primary/70" />
                    <span className="font-medium text-foreground">
                        ~{estDistanceMs.toFixed(1)} km
                    </span>
                </div>

                <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-4 w-4 shrink-0 text-primary/70" />
                    <span className="font-medium text-foreground">
                        ~{estMins} min
                    </span>
                </div>

                <div className="flex items-center gap-2 text-muted-foreground">
                    <Coins className="h-4 w-4 shrink-0 text-green-600" />
                    <span className="font-bold text-green-700">
                        {order.deliveryFee.toFixed(2)} €
                    </span>
                </div>
            </div>

            {/* Action */}
            <Button
                className="mt-2 w-full font-bold h-11"
                onClick={() => onAccept(order.id)}
                disabled={disabled}
            >
                Aceptar Pedido
            </Button>
        </div>
    )
}
