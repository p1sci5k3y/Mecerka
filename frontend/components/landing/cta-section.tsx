import { Link } from "@/lib/navigation"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"

export function CtaSection() {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-primary px-8 py-16 text-center">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_80%_at_50%_50%,hsl(220_72%_60%/0.3),transparent)]" />
          <h2 className="font-display text-3xl font-bold text-primary-foreground text-balance sm:text-4xl">
            Tu barrio te necesita. Tu barrio te espera.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-primary-foreground/80 text-pretty">
            Tanto si buscas productos únicos cerca de ti como si tienes un comercio
            y quieres llegar a más clientes, Mecerka es tu sitio.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link href="/register">
              <Button
                size="lg"
                variant="secondary"
                className="gap-2"
              >
                Empieza gratis
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/products">
              <Button
                size="lg"
                variant="outline"
                className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
              >
                Explorar catálogo
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
