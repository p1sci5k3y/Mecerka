"use client"

import dynamic from "next/dynamic"
import { MapPin, Truck } from "lucide-react"
import { shouldShowRouteMap } from "@/components/runner/runner-order-detail-utils"

const DynamicDeliveryMap = dynamic(() => import("@/components/tracking/DynamicDeliveryMap"), {
  ssr: false,
  loading: () => <div className="h-[400px] w-full animate-pulse rounded-2xl bg-muted" />,
})

type RunnerLiveRouteCardProps = {
  orderId: string
  deliveryStatus?: string | null
  deliveryLat?: number | null
  deliveryLng?: number | null
}

export function RunnerLiveRouteCard({
  orderId,
  deliveryStatus,
  deliveryLat,
  deliveryLng,
}: RunnerLiveRouteCardProps) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <Truck className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-bold text-foreground">Ruta operativa en vivo</h2>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        El runner ya puede ver el trayecto real del pedido y, cuando la entrega entra en fase
        activa, emitir su GPS sin salir de esta ficha.
      </p>
      <div className="mt-5">
        {shouldShowRouteMap(deliveryStatus) ? (
          <div className="overflow-hidden rounded-2xl border border-border/50">
            <div className="h-[420px] w-full">
              <DynamicDeliveryMap
                orderId={orderId}
                initialLat={deliveryLat ?? undefined}
                initialLng={deliveryLng ?? undefined}
                isRunner
              />
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border/70 bg-background/70 px-4 py-8 text-center text-sm text-muted-foreground">
            <MapPin className="mx-auto mb-3 h-5 w-5 text-primary" />
            La ruta se habilitará en cuanto esta entrega tenga contexto operativo suficiente.
          </div>
        )}
      </div>
    </div>
  )
}
