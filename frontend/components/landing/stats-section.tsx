const stats = [
  { value: "100+", label: "Comercios locales" },
  { value: "15", label: "Ciudades conectadas" },
  { value: "2.5k", label: "Pedidos entregados" },
  { value: "98%", label: "Clientes satisfechos" },
]

export function StatsSection() {
  return (
    <section className="border-t border-border bg-secondary/30 py-16">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-2xl font-bold tracking-tight text-foreground text-balance">
            El comercio de cercanía crece cada día
          </h2>
          <p className="mt-2 text-sm text-muted-foreground text-pretty">
            Cifras que demuestran que otra forma de comprar es posible.
          </p>
        </div>
        <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col items-center text-center">
              <span className="font-display text-4xl font-bold tracking-tight text-primary">
                {stat.value}
              </span>
              <span className="mt-1 text-sm text-muted-foreground">{stat.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
