"use client"

import {
  formatDistanceLabel,
  formatLastUpdateLabel,
  runnerTrackingStatusLabel,
} from "@/components/tracking/delivery-map-utils"

type DeliveryTrackingSummaryProps = {
  trackingStatus: string | null
  etaLabel: string
  remainingDistanceKm: number | null
  lastUpdateAt: string | null
  runnerName: string | null
}

export function DeliveryTrackingSummary({
  trackingStatus,
  etaLabel,
  remainingDistanceKm,
  lastUpdateAt,
  runnerName,
}: DeliveryTrackingSummaryProps) {
  return (
    <div className="absolute left-4 top-4 z-[1000] max-w-sm rounded-xl border border-border bg-white/95 p-4 shadow-lg backdrop-blur dark:bg-slate-900/95">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Estado</p>
          <p className="text-sm font-semibold text-foreground">
            {runnerTrackingStatusLabel(trackingStatus)}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
            ETA orientativa
          </p>
          <p className="text-sm font-semibold text-foreground">{etaLabel}</p>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Distancia restante
          </p>
          <p className="text-sm font-semibold text-foreground">
            {formatDistanceLabel(remainingDistanceKm)}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Última señal
          </p>
          <p className="text-sm font-semibold text-foreground">
            {formatLastUpdateLabel(lastUpdateAt)}
          </p>
        </div>
      </div>
      <div className="mt-3 border-t border-border/70 pt-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Runner</p>
        <p className="text-sm font-semibold text-foreground">
          {runnerName || "Asignación confirmada"}
        </p>
      </div>
    </div>
  )
}
