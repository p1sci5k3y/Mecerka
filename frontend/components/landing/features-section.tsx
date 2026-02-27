import {
  Search,
  ShoppingCart,
  Truck,
  BarChart3,
  Smartphone,
  Sparkles,
} from "lucide-react"

const features = [
  {
    icon: Search,
    title: "Busca por tu ciudad",
    description:
      "Filtra por zona y categoría. Solo ves los productos disponibles cerca de ti, sin ruido.",
  },
  {
    icon: ShoppingCart,
    title: "Carrito multi-tienda",
    description:
      "Añade productos de distintos comercios locales y gestiona todo en un único pedido.",
  },
  {
    icon: Truck,
    title: "Entregas optimizadas",
    description:
      "Pedidos agrupados por ciudad para una logística más eficiente y tiempos de entrega reducidos.",
  },
  {
    icon: BarChart3,
    title: "Panel para comercios",
    description:
      "Si tienes un negocio, gestiona tus productos, pedidos y ventas desde un panel claro y sencillo.",
  },
  {
    icon: Smartphone,
    title: "Desde cualquier lugar",
    description:
      "Experiencia pensada para el móvil. Compra de camino a casa o gestiona tu tienda sobre la marcha.",
  },
  {
    icon: Sparkles,
    title: "Te conocemos",
    description:
      "Recomendaciones personalizadas basadas en tus gustos, tu ciudad y lo que compran tus vecinos.",
  },
]

export function FeaturesSection() {
  return (
    <section className="border-t border-border bg-secondary/30 py-20">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight text-foreground text-balance">
            La forma más fácil de apoyar el comercio local
          </h2>
          <p className="mt-3 text-muted-foreground text-pretty">
            Todo lo que clientes y comercios necesitan, sin complicaciones y en una sola plataforma.
          </p>
        </div>
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="group rounded-xl border border-border bg-card p-6 transition-all hover:border-primary/30 hover:shadow-md"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="font-display text-base font-semibold text-card-foreground">
                {f.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
