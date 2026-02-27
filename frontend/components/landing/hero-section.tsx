import { Link } from "@/lib/navigation"
import { ArrowRight, MapPin, ShoppingBag, Heart } from "lucide-react"
import { Button } from "@/components/ui/button"

export function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,hsl(220_72%_50%/0.12),transparent)]" />
      <div className="mx-auto max-w-7xl px-4 pb-16 pt-20 lg:px-8 lg:pb-24 lg:pt-32">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-4 py-1.5 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4 text-primary" />
            Comercio de cercanía, al alcance de un clic
          </div>
          <h1 className="font-display text-4xl font-bold leading-tight tracking-tight text-foreground text-balance sm:text-5xl lg:text-6xl">
            Las tiendas de tu barrio,{" "}
            <span className="text-primary">ahora en tu bolsillo</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground text-pretty">
            Mecerka conecta a los comercios locales de tu ciudad contigo.
            Compra a varias tiendas en un solo pedido, recibe todo cerca de casa
            y apoya la economía de tu barrio.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link href="/products">
              <Button size="lg" className="gap-2">
                Descubre tu ciudad
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/register">
              <Button variant="outline" size="lg">
                Soy comercio, quiero vender
              </Button>
            </Link>
          </div>
        </div>

        <div className="mx-auto mt-20 grid max-w-4xl gap-6 sm:grid-cols-3">
          {[
            {
              icon: MapPin,
              title: "Siempre cerca",
              desc: "Productos organizados por ciudad. Solo ves lo que te queda a mano, sin intermediarios lejanos.",
            },
            {
              icon: ShoppingBag,
              title: "Un carrito, varias tiendas",
              desc: "Compra a distintos comercios de tu zona en un solo pedido unificado.",
            },
            {
              icon: Heart,
              title: "Impulsa lo local",
              desc: "Cada compra apoya directamente a los negocios que dan vida a tu barrio.",
            },
          ].map((feature) => (
            <div
              key={feature.title}
              className="rounded-xl border border-border bg-card p-6 transition-shadow hover:shadow-md"
            >
              <feature.icon className="mb-3 h-8 w-8 text-primary" />
              <h3 className="font-display text-base font-semibold text-card-foreground">
                {feature.title}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {feature.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
