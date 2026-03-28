"use client"

import type { ProviderOrder } from "@/lib/types"
import { getRunnerNextActionSummary } from "@/components/runner/runner-next-action"

type RunnerNextActionCardProps = {
  deliveryStatus?: string | null
  paymentStatus?: string | null
  activeStops: ProviderOrder[]
  openSupportCount: number
}

function toneStyles(tone: "info" | "warning" | "success") {
  switch (tone) {
    case "warning":
      return "border-amber-300/60 bg-amber-50"
    case "success":
      return "border-emerald-300/60 bg-emerald-50"
    default:
      return "border-sky-300/60 bg-sky-50"
  }
}

export function RunnerNextActionCard(props: RunnerNextActionCardProps) {
  const summary = getRunnerNextActionSummary(props)

  return (
    <section className={`rounded-2xl border p-6 shadow-sm ${toneStyles(summary.tone)}`}>
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-bold text-foreground">Siguiente acción operativa</h2>
        <p className="text-base font-semibold text-foreground">{summary.title}</p>
        <p className="text-sm text-muted-foreground">{summary.description}</p>
      </div>
    </section>
  )
}
