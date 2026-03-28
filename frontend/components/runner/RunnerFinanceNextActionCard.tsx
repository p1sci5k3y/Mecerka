"use client"

import type { PaymentConnectStatusSummary } from "@/lib/types"
import { getRunnerFinanceNextActionSummary } from "@/components/runner/runner-finance-next-action"

type RunnerFinanceNextActionCardProps = {
  connectStatus: PaymentConnectStatusSummary | null
  paidOrderCount: number
  pendingOrderCount: number
  visibleRefundCount: number
  visibleIncidentCount: number
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

export function RunnerFinanceNextActionCard(props: RunnerFinanceNextActionCardProps) {
  const summary = getRunnerFinanceNextActionSummary(props)

  return (
    <section className={`rounded-2xl border p-6 shadow-sm ${toneStyles(summary.tone)}`}>
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-bold text-foreground">Siguiente acción financiera</h2>
        <p className="text-base font-semibold text-foreground">{summary.title}</p>
        <p className="text-sm text-muted-foreground">{summary.description}</p>
      </div>
    </section>
  )
}
