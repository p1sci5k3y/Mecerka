"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { productsService } from "@/lib/services/products-service"
import { ProductCard } from "@/components/product-card"
import type { Product } from "@/lib/types"
import { SectionHeader } from "@/components/ui/section-header"
import { SealBadge } from "@/components/ui/seal-badge"
import { Loader2, ShieldCheck, MapPin, Truck, HeartHandshake } from "lucide-react"

// Mocked provider data since there is no public provider endpoint yet
const MOCK_PROVIDERS: Record<string, { name: string, city: string, banner: string, joined: string, bio: string }> = {
    "talleres-del-sur": {
        name: "Alfarería del Sur",
        city: "Sevilla",
        banner: "Fundiendo barro con alma.",
        joined: "2024",
        bio: "Tres generaciones dando forma al barro con pasión, recuperando técnicas tradicionales andaluzas."
    },
    "hilos-y-nudos": {
        name: "Hilos y Nudos",
        city: "Granada",
        banner: "Tejiendo historias.",
        joined: "2025",
        bio: "Textiles tejidos en telar manual con fibras naturales de proximidad y teñidos orgánicos."
    }
}

export default function StorePage() {
    const params = useParams()
    const providerId = typeof params.providerId === 'string' ? params.providerId : 'talleres-del-sur'

    const [products, setProducts] = useState<Product[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        productsService.getAll().then((data) => {
            // TODO: Replace local filtering with a direct backend call when `GET /products/provider/:id` is available
            // For now, if the DB doesn't have provider products specifically linked to this mock ID, we just show some products as a stub
            const filtered = data.filter(p => String(p.providerId) === providerId)
            setProducts(filtered.length > 0 ? filtered : data.slice(0, 4))
            setLoading(false)
        })
    }, [providerId])

    const provider = MOCK_PROVIDERS[providerId] || {
        name: "Taller Artesano",
        city: "Ciudad",
        banner: "Creaciones con alma y sello propio.",
        joined: "2026",
        bio: "Bienvenidos a nuestro taller. Cada pieza es única y cuenta una historia."
    }

    return (
        <div className="flex min-h-screen flex-col bg-background">
            <Navbar />

            <main className="flex-1">
                {/* Store Hero Banner */}
                <section className="relative overflow-hidden bg-primary/10 border-b border-border py-16 md:py-24">
                    <div className="container relative z-10 px-4 md:px-6">
                        <div className="max-w-3xl flex flex-col items-start gap-4">
                            <SealBadge className="mb-4 bg-background">
                                <ShieldCheck className="h-4 w-4 mr-2 text-primary" />
                                Sello de Confianza Mecerka
                            </SealBadge>

                            <h1 className="font-display text-4xl font-bold md:text-5xl lg:text-6xl text-foreground">
                                {provider.name}
                            </h1>
                            <p className="font-display text-xl md:text-2xl text-primary font-medium italic">
                                "{provider.banner}"
                            </p>

                            <p className="mt-4 text-muted-foreground leading-relaxed">
                                {provider.bio}
                            </p>

                            <div className="mt-6 flex flex-wrap items-center gap-4 text-sm font-medium text-muted-foreground">
                                <span className="flex items-center gap-1.5 bg-card px-3 py-1.5 rounded-full border border-border">
                                    <MapPin className="h-4 w-4" /> Desde {provider.city}
                                </span>
                                <span className="flex items-center gap-1.5 bg-card px-3 py-1.5 rounded-full border border-border">
                                    <HeartHandshake className="h-4 w-4" /> Artesano verificado ({provider.joined})
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Abstract background decorative overlay mimicking paper texture or lines */}
                    <div className="absolute right-0 top-0 h-full w-1/3 opacity-20 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary to-transparent pointer-events-none" />
                </section>

                {/* Catalog Section */}
                <section className="container px-4 py-16 md:px-6">
                    <SectionHeader
                        title="Catálogo del taller"
                        subtitle="Las creaciones disponibles ahora mismo."
                        className="mb-10"
                    />

                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : (
                        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {products.map((product) => (
                                <ProductCard key={product.id} product={product} />
                            ))}
                        </div>
                    )}
                </section>

                {/* Delivery Terms / Workshop practices Section */}
                <section className="bg-secondary/10 border-t border-border py-16">
                    <div className="container px-4 md:px-6">
                        <h2 className="font-display text-2xl font-bold mb-8 text-center">¿Cómo entrega este taller?</h2>

                        <div className="grid gap-6 md:grid-cols-3 max-w-4xl mx-auto">
                            <div className="bg-card p-6 rounded-xl border border-border/50 shadow-sm flex flex-col items-center text-center gap-3">
                                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                                    <Truck className="h-6 w-6 text-primary" />
                                </div>
                                <h3 className="font-bold">Reparto Ético Mecerka</h3>
                                <p className="text-sm text-muted-foreground">Tus pedidos son entregados por repartidores de confianza del mismo barrio.</p>
                            </div>

                            <div className="bg-card p-6 rounded-xl border border-border/50 shadow-sm flex flex-col items-center text-center gap-3">
                                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                                    <HeartHandshake className="h-6 w-6 text-primary" />
                                </div>
                                <h3 className="font-bold">Trato Directo</h3>
                                <p className="text-sm text-muted-foreground">Toda la ganancia apoya directamente la economía circular y al creador.</p>
                            </div>

                            <div className="bg-card p-6 rounded-xl border border-border/50 shadow-sm flex flex-col items-center text-center gap-3">
                                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                                    <ShieldCheck className="h-6 w-6 text-primary" />
                                </div>
                                <h3 className="font-bold">Garantía Artesana</h3>
                                <p className="text-sm text-muted-foreground">Si no es lo que esperabas, el comercio local responde. Transparencia total.</p>
                            </div>
                        </div>
                    </div>
                </section>

            </main>
            <Footer />
        </div>
    )
}
