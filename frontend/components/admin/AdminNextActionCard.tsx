"use client"

type AdminNextActionCardProps = {
  heading: string
  title: string
  description: string
  tone: "info" | "warning" | "success"
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

export function AdminNextActionCard({
  heading,
  title,
  description,
  tone,
}: AdminNextActionCardProps) {
  return (
    <section className={`rounded-xl border p-6 shadow-sm ${toneStyles(tone)}`}>
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-foreground">{heading}</h2>
        <p className="text-base font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </section>
  )
}
