"use client"

import { useEffect, useMemo, useState } from "react"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { ProtectedRoute } from "@/components/protected-route"
import { Button } from "@/components/ui/button"
import { Link } from "@/lib/navigation"
import { productsService } from "@/lib/services/products-service"
import { useAuth } from "@/contexts/auth-context"
import type { Product } from "@/lib/types"
import { BookOpenCheck, CreditCard, Loader2, Package, Store, Wand2 } from "lucide-react"

function statusText(done: boolean, doneText: string, pendingText: string) {
  return done ? doneText : pendingText
}

export default function ProviderOnboardingPage() {
  return (
    <ProtectedRoute allowedRoles={["PROVIDER"]}>
      <ProviderOnboardingContent />
    </ProtectedRoute>
  )
}

function ProviderOnboardingContent() {
  const { user } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadProducts() {
      try {
        const data = await productsService.getMyProducts()
        setProducts(data)
      } catch (error) {
        console.error("Error loading provider onboarding:", error)
      } finally {
        setLoading(false)
      }
    }

    void loadProducts()
  }, [])

  const hasProducts = products.length > 0
  const hasStripe = Boolean(user?.stripeAccountId)
  const lowStockCount = useMemo(() => products.filter((product) => product.stock < 5).length, [products])

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <Navbar />
        <main className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </main>
        <Footer />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="flex-1 bg-[#FBF6EE] px-6 py-10 dark:bg-[#140D0B] md:px-10 lg:px-16">
        <div className="mx-auto flex max-w-6xl flex-col gap-8">
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              Onboarding de provider
            </p>
            <h1 className="font-display text-4xl font-extrabold tracking-tight text-foreground">
              Publica catálogo y activa cobros sin ir a ciegas
            </h1>
            <p className="max-w-3xl text-lg text-muted-foreground">
              Esta guía reúne el alta de producto, la revisión de inventario y la conexión de cobros para que tu comercio no se quede a medias.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Productos publicados
              </p>
              <p className="mt-3 font-display text-3xl font-bold text-foreground">
                {products.length}
              </p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Stripe Connect
              </p>
              <p className="mt-3 text-2xl font-bold text-foreground">
                {hasStripe ? "Conectado" : "Pendiente"}
              </p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Stock bajo
              </p>
              <p className="mt-3 font-display text-3xl font-bold text-foreground">
                {lowStockCount}
              </p>
            </div>
          </div>

          <section className="grid gap-6 lg:grid-cols-3">
            <article className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-primary/10 p-3 text-primary">
                  <Wand2 className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-foreground">1. Alta guiada</h2>
                  <p className="text-sm text-muted-foreground">
                    {statusText(hasProducts, "Ya puedes ampliar tu catálogo.", "Crea el primer producto para que tu tienda empiece a vender.")}
                  </p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button asChild>
                  <Link href="/provider/products/new">Crear producto</Link>
                </Button>
              </div>
            </article>

            <article className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-primary/10 p-3 text-primary">
                  <Package className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-foreground">2. Revisa inventario</h2>
                  <p className="text-sm text-muted-foreground">
                    {statusText(hasProducts, `Tienes ${products.length} producto(s) visibles para revisar.`, "Aún no hay inventario que revisar.")}
                  </p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button asChild variant="outline">
                  <Link href="/provider/products">Abrir inventario</Link>
                </Button>
              </div>
            </article>

            <article className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-primary/10 p-3 text-primary">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-foreground">3. Activa cobros</h2>
                  <p className="text-sm text-muted-foreground">
                    {statusText(hasStripe, "Tu cuenta ya puede recibir liquidaciones.", "Conecta Stripe para cerrar el circuito económico.")}
                  </p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button asChild variant="outline">
                  <Link href="/provider/finance">Cobros y devoluciones</Link>
                </Button>
              </div>
            </article>
          </section>

          <section className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <BookOpenCheck className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-bold text-foreground">Checklist rápida</h2>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-border/50 bg-background/70 p-4 text-sm">
                <p className="font-semibold text-foreground">Catálogo mínimo</p>
                <p className="mt-2 text-muted-foreground">
                  {statusText(hasProducts, "OK. Ya existe catálogo inicial.", "Pendiente. Crea al menos un producto para empezar a aparecer en compra.")}
                </p>
              </div>
              <div className="rounded-xl border border-border/50 bg-background/70 p-4 text-sm">
                <p className="font-semibold text-foreground">Visibilidad de stock</p>
                <p className="mt-2 text-muted-foreground">
                  {lowStockCount > 0
                    ? `Tienes ${lowStockCount} producto(s) con stock bajo.`
                    : "No hay alertas inmediatas de stock bajo."}
                </p>
              </div>
              <div className="rounded-xl border border-border/50 bg-background/70 p-4 text-sm">
                <p className="font-semibold text-foreground">Cobro del comercio</p>
                <p className="mt-2 text-muted-foreground">
                  {statusText(hasStripe, "OK. Stripe Connect conectado.", "Pendiente. Sin Stripe no podrás liquidar pedidos reales.")}
                </p>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/provider/products/new">
                  <Store className="mr-2 h-4 w-4" />
                  Empezar ahora
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/provider/sales">Abrir panel operativo</Link>
              </Button>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  )
}
