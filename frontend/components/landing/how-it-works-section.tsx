import { UserPlus, Search, ShoppingCart, PackageCheck } from "lucide-react"

const steps = [
  {
    icon: UserPlus,
    step: "01",
    title: "Crea tu cuenta",
    description:
      "Regístrate como cliente para comprar o como comercio para vender. Es gratis y en menos de un minuto.",
  },
  {
    icon: Search,
    step: "02",
    title: "Explora tu ciudad",
    description:
      "Busca productos por categoría, filtra por tu zona y descubre lo que los comercios de tu barrio ofrecen.",
  },
  {
    icon: ShoppingCart,
    step: "03",
    title: "Llena tu carrito",
    description:
      "Añade productos de distintas tiendas locales. Todo se gestiona en un solo pedido unificado.",
  },
  {
    icon: PackageCheck,
    step: "04",
    title: "Recibe en tu zona",
    description:
      "Los pedidos se agrupan por ciudad para optimizar las entregas. Comercio local, logística inteligente.",
  },
]

export function HowItWorksSection() {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight text-foreground text-balance">
            Así de fácil funciona
          </h2>
          <p className="mt-3 text-muted-foreground text-pretty">
            De tu pantalla al comercio de tu calle, en cuatro pasos.
          </p>
        </div>
        <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s) => (
            <div key={s.step} className="relative flex flex-col items-center text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                <s.icon className="h-6 w-6" />
              </div>
              <span className="mb-1 text-xs font-bold uppercase tracking-widest text-primary">
                Paso {s.step}
              </span>
              <h3 className="font-display text-lg font-semibold text-foreground">
                {s.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {s.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
