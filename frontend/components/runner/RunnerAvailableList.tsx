import { Order } from "@/lib/types"
import { RunnerOrderCard } from "./RunnerOrderCard"
import { PackageSearch } from "lucide-react"

interface Props {
    orders: Order[]
    onAccept: (id: string) => Promise<void>
    isActionDisabled?: boolean
}

export function RunnerAvailableList({ orders, onAccept, isActionDisabled }: Props) {
    if (orders.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border/60 bg-muted/20 py-16 text-center">
                <PackageSearch className="h-10 w-10 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-display font-semibold text-foreground">Todo al día</h3>
                <p className="text-muted-foreground font-medium mt-1">No hay pedidos disponibles en este momento.</p>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-4">
            {orders.map(order => (
                <div
                    key={order.id}
                    className="transition-all animate-in slide-in-from-bottom-3 fade-in"
                >
                    <RunnerOrderCard
                        order={order}
                        onAccept={onAccept}
                        disabled={isActionDisabled}
                    />
                </div>
            ))}
        </div>
    )
}
