"use client"

import type { OrderTrackingSnapshot } from "@/lib/types"
import { getDeliveryNextStepSummary } from "@/components/tracking/delivery-next-step"

type DeliveryNextStepCardProps = {
  orderStatus?: string | null
  deliveryStatus?: string | null
  tracking: OrderTrackingSnapshot | null
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

export function DeliveryNextStepCard(props: DeliveryNextStepCardProps) {
  const summary = getDeliveryNextStepSummary(props)

  return (
    <section className={`mt-8 rounded-2xl border p-6 ${toneStyles(summary.tone)}`}>
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">Siguiente paso</h2>
        <p className="text-base font-semibold text-foreground">{summary.title}</p>
        <p className="text-sm text-muted-foreground">{summary.description}</p>
      </div>
    </section>
  )
}
