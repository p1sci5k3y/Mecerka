import { ArrowRight, MapPin, Hammer, ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { SectionHeader } from "@/components/ui/section-header"
import { SealBadge } from "@/components/ui/seal-badge"
import { Link } from '@/lib/navigation';

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background selection:bg-primary/20">
      <Navbar />
      <main className="flex-1">
        {/* Editorial Hero Section with Vintage Engraving Background */}
        <section
          className="relative overflow-hidden w-full bg-[#fbf6ee] py-24 lg:py-40 border-b border-border/50"
          style={{
            backgroundImage: `linear-gradient(to right, rgba(251, 246, 238, 0.4) 0%, rgba(251, 246, 238, 0.95) 55%, rgba(251, 246, 238, 1) 100%), url('/brand/hero-bg.png')`,
            backgroundPosition: "left center",
            backgroundSize: "cover",
            backgroundRepeat: "no-repeat"
          }}
        >
          <div className="container relative z-10 px-4 md:px-6 flex justify-end">
            <div className="flex w-full md:w-[55%] flex-col items-start gap-6 text-left">
              <SealBadge className="mb-2">Auténtico & Local</SealBadge>

              <h1 className="font-display text-5xl font-extrabold tracking-tight sm:text-6xl lg:text-7xl text-foreground mix-blend-multiply">
                Apoya a los talleres de tu ciudad
              </h1>

              <p className="max-w-[32rem] leading-relaxed text-foreground/85 sm:text-xl font-medium mix-blend-multiply">
                Descubre productos únicos hechos a mano cerca de ti. Directamente de los creadores visuales e independientes a tu puerta.
              </p>

              <div className="mt-8 flex flex-col sm:flex-row gap-4">
                <Link href="/products">
                  <Button size="lg" className="h-14 px-8 text-base shadow-sm font-semibold">
                    Explorar el mercado
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/register">
                  <Button size="lg" variant="outline" className="h-14 px-8 text-base border-primary/30 bg-background/50 hover:bg-background/80 backdrop-blur-sm font-semibold">
                    Crear cuenta
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="container px-4 py-20 md:px-6">
          <SectionHeader
            title="Lo que ya puedes hacer"
            subtitle="Superficie pública real del MVP, sin dependencias ocultas ni recorridos simulados."
            className="mb-12"
          />
          <div className="grid gap-8 md:grid-cols-3">
            <article className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Hammer className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-display text-xl font-bold">Explorar catálogo real</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                El catálogo público consume productos reales del backend. Desde ahí puedes añadir piezas al carrito y preparar tu compra.
              </p>
              <div className="mt-5">
                <Link href="/products">
                  <Button variant="outline" className="border-primary/20 hover:bg-primary/5">
                    Ver catálogo
                  </Button>
                </Link>
              </div>
            </article>

            <article className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <ShieldCheck className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-display text-xl font-bold">Crear cuenta cliente</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                El alta pública crea cuentas cliente. Si después quieres vender o repartir, la solicitud de rol se hace desde tu perfil autenticado.
              </p>
              <div className="mt-5">
                <Link href="/register">
                  <Button variant="outline" className="border-primary/20 hover:bg-primary/5">
                    Crear cuenta
                  </Button>
                </Link>
              </div>
            </article>

            <article className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <MapPin className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-display text-xl font-bold">Comprar de forma local</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Puedes preparar tu cesta sin sesión y autenticarte justo antes del checkout. El flujo online actual ya soporta pedidos multiproveedor dentro de una misma ciudad.
              </p>
            </article>
          </div>
        </section>

      </main>
      <Footer />
    </div>
  )
}
