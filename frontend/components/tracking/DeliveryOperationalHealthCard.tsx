"use client"

import type { OrderTrackingSnapshot } from "@/lib/types"
import {
  getPickupCoverageLabel,
  getRunnerAssignmentLabel,
  getTrackingSignalLabel,
  getTrackingSignalState,
} from "@/components/tracking/delivery-operational-health"

type DeliveryOperationalHealthCardProps = {
  tracking: OrderTrackingSnapshot | null
  stopCount: number
  openSupportCount: number
}

function signalTone(signalState: ReturnType<typeof getTrackingSignalState>) {
  switch (signalState) {
    case "recent":
      return "border-emerald-300/60 bg-emerald-50"
    case "stale":
      return "border-amber-300/60 bg-amber-50"
    default:
      return "border-border/60 bg-card/70"
  }
}

export function DeliveryOperationalHealthCard({
  tracking,
  stopCount,
  openSupportCount,
}: DeliveryOperationalHealthCardProps) {
  const signalState = getTrackingSignalState(tracking?.updatedAt ?? null)

  return (
    <section className="mt-8 rounded-2xl border bg-card p-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">Salud operativa</h2>
        <p className="text-sm text-muted-foreground">
          Lectura rápida de asignación, señal GPS, soporte abierto y cobertura de recogidas.
        </p>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-border/60 bg-card/70 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Runner
          </p>
          <p className="mt-2 font-semibold text-foreground">
            {getRunnerAssignmentLabel(tracking)}
          </p>
        </article>

        <article className={`rounded-xl border p-4 shadow-sm ${signalTone(signalState)}`}>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Última señal
          </p>
          <p className="mt-2 font-semibold text-foreground">
            {getTrackingSignalLabel(tracking?.updatedAt ?? null)}
          </p>
        </article>

        <article className="rounded-xl border border-border/60 bg-card/70 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Soporte abierto
          </p>
          <p className="mt-2 font-semibold text-foreground">
            {openSupportCount > 0 ? `${openSupportCount} caso(s)` : "Sin casos"}
          </p>
        </article>

        <article className="rounded-xl border border-border/60 bg-card/70 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Cobertura de recogidas
          </p>
          <p className="mt-2 font-semibold text-foreground">
            {getPickupCoverageLabel(tracking?.deliveryStatus ?? tracking?.status ?? null, stopCount)}
          </p>
        </article>
      </div>
    </section>
  )
}
