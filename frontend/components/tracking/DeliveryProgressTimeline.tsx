"use client"

type DeliveryProgressTimelineProps = {
  orderStatus?: string | null
  deliveryStatus?: string | null
  stopCount: number
}

type Milestone = {
  key: string
  title: string
  description: string
  state: "done" | "current" | "upcoming"
}

function normalizeStage(orderStatus?: string | null, deliveryStatus?: string | null) {
  if (deliveryStatus === "DELIVERED" || orderStatus === "DELIVERED") return 4
  if (deliveryStatus === "IN_TRANSIT" || orderStatus === "IN_TRANSIT") return 3
  if (deliveryStatus === "PICKED_UP" || deliveryStatus === "PICKUP_PENDING") return 2
  if (deliveryStatus === "ASSIGNED" || orderStatus === "CONFIRMED" || orderStatus === "ACCEPTED") return 1
  return 1
}

export function buildDeliveryMilestones({
  orderStatus,
  deliveryStatus,
  stopCount,
}: DeliveryProgressTimelineProps): Milestone[] {
  const stage = normalizeStage(orderStatus, deliveryStatus)

  return [
    {
      key: "confirmed",
      title: "Pedido confirmado",
      description: "El pedido ya está validado y entra en flujo operativo.",
      state: stage > 1 ? "done" : "current",
    },
    {
      key: "pickup",
      title: "Recogida coordinada",
      description:
        stopCount > 1
          ? `${stopCount} paradas operativas previstas para consolidar el reparto.`
          : "El runner prepara la recogida del pedido y su consolidación final.",
      state: stage > 2 ? "done" : stage === 2 ? "current" : "upcoming",
    },
    {
      key: "transit",
      title: "Pedido en reparto",
      description: "La ruta ya está activa y el seguimiento en mapa refleja el último tramo.",
      state: stage > 3 ? "done" : stage === 3 ? "current" : "upcoming",
    },
    {
      key: "delivered",
      title: "Entrega completada",
      description: "El pedido llega a destino y el seguimiento se cierra.",
      state: stage === 4 ? "done" : "upcoming",
    },
  ]
}

function milestoneStyles(state: Milestone["state"]) {
  switch (state) {
    case "done":
      return {
        dot: "bg-primary border-primary text-white",
        card: "border-primary/30 bg-primary/5",
        badge: "Completado",
      }
    case "current":
      return {
        dot: "border-primary bg-background text-primary",
        card: "border-primary/40 bg-background",
        badge: "En curso",
      }
    default:
      return {
        dot: "border-border bg-background text-muted-foreground",
        card: "border-border/60 bg-card/70",
        badge: "Pendiente",
      }
  }
}

export function DeliveryProgressTimeline(props: DeliveryProgressTimelineProps) {
  const milestones = buildDeliveryMilestones(props)

  return (
    <section className="mt-8 rounded-2xl border bg-card p-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">Progreso del reparto</h2>
        <p className="text-sm text-muted-foreground">
          Vista rápida del estado operativo del pedido para que el mapa no sea el único contexto.
        </p>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-4">
        {milestones.map((milestone, index) => {
          const styles = milestoneStyles(milestone.state)

          return (
            <article
              key={milestone.key}
              className={`rounded-xl border p-4 shadow-sm ${styles.card}`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-bold ${styles.dot}`}
                >
                  {index + 1}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-foreground">{milestone.title}</h3>
                    <span className="text-xs text-muted-foreground">{styles.badge}</span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{milestone.description}</p>
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
