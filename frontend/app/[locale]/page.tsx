import { ArrowRight, MapPin, Hammer, ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { SectionHeader } from "@/components/ui/section-header"
import { SealBadge } from "@/components/ui/seal-badge"
import { TagChip } from "@/components/ui/tag-chip"

import { useTranslations } from 'next-intl';
import { Link } from '@/lib/navigation';

export default function Home() {
  const t = useTranslations('Landing');

  // Mocks for Editorial layout (Etapa 2)
  const highlightedProducts = [
    { id: 1, name: "Cuenco de Cerámica Esmaltada", artisan: "Alfarería del Sur", price: "45.00 €", tag: "Cerámica" },
    { id: 2, name: "Bolso de Cuero Cosido a Mano", artisan: "Taller Marroquinería", price: "120.00 €", tag: "Cuero" },
    { id: 3, name: "Vela de Soja Botánica", artisan: "Luz de Alba", price: "18.50 €", tag: "Hogar" },
    { id: 4, name: "Tabla de Olivo Tallada", artisan: "Carpintería Raíces", price: "35.00 €", tag: "Madera" },
  ]

  const highlightedWorkshops = [
    { id: "talleres-del-sur", name: "Alfarería del Sur", desc: "Tres generaciones dando forma al barro con pasión, recuperando técnicas tradicionales andaluzas." },
    { id: "hilos-y-nudos", name: "Hilos y Nudos", desc: "Textiles tejidos en telar manual con fibras naturales de proximidad y teñidos orgánicos." },
  ]

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
                    Soy Artesano
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Hoy en tu barrio Section */}
        <section className="container px-4 py-20 md:px-6">
          <SectionHeader
            title="Hoy en tu barrio"
            subtitle="Piezas únicas seleccionadas por nuestro equipo."
            className="mb-12"
          />
          <div className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
            {highlightedProducts.map((p) => (
              <Link key={p.id} href={`/products/${p.id}`} className="group flex flex-col gap-3">
                <div className="aspect-[4/5] w-full overflow-hidden rounded-md bg-muted/40 border border-border/60 relative p-4 flex items-center justify-center transition-colors group-hover:bg-muted/60">
                  < Hammer className="h-12 w-12 text-muted-foreground/30" />
                  <div className="absolute top-3 left-3">
                    <TagChip variant="outline" className="bg-background/90 backdrop-blur-sm">{p.tag}</TagChip>
                  </div>
                </div>
                <div>
                  <h3 className="font-display font-bold text-lg group-hover:text-primary transition-colors leading-tight">{p.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1.5 flex items-center gap-1.5 line-clamp-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {p.artisan}
                  </p>
                  <p className="mt-2.5 font-medium">{p.price}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Tiendas con historia Section */}
        <section className="bg-secondary/10 border-y border-border py-20 relative">
          {/* Decorative background paper grain overlay could go here */}
          <div className="container px-4 md:px-6 relative z-10">
            <SectionHeader
              title="Talleres con historia"
              subtitle="Conoce las manos y las historias detrás de cada producto."
              className="mb-12 text-center"
            />
            <div className="grid gap-8 md:grid-cols-2 max-w-5xl mx-auto">
              {highlightedWorkshops.map((w) => (
                <Link key={w.id} href={`/store/${w.id}`} className="group flex flex-col sm:flex-row gap-6 bg-card border border-border rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
                  <div className="h-32 w-32 shrink-0 rounded-full bg-muted/30 border-4 border-background shadow-inner flex items-center justify-center">
                    <ShieldCheck className="h-8 w-8 text-muted-foreground/50" />
                  </div>
                  <div className="flex flex-col justify-center">
                    <SealBadge className="w-fit mb-3 bg-secondary/10 border-secondary/30 text-secondary-foreground">{w.name}</SealBadge>
                    <p className="text-muted-foreground text-sm leading-relaxed">{w.desc}</p>
                    <span className="mt-4 text-sm font-semibold text-primary group-hover:underline flex items-center gap-1">
                      Visitar taller <ArrowRight className="h-3 w-3" />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

      </main>
      <Footer />
    </div>
  )
}
