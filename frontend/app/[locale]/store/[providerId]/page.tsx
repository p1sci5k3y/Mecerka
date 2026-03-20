"use client"

import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { Link } from "@/lib/navigation"
import { Button } from "@/components/ui/button"
import { SectionHeader } from "@/components/ui/section-header"
import { Info, ArrowRight } from "lucide-react"

export default function StorePage() {
    return (
        <div className="flex min-h-screen flex-col bg-background">
            <Navbar />

            <main className="flex-1">
                <section className="container px-4 py-20 md:px-6">
                    <SectionHeader
                        title="Escaparate público no disponible"
                        subtitle="La ficha pública individual de talleres todavía no forma parte de la superficie real del MVP."
                        className="mb-10"
                    />
                    <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
                        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                            <Info className="h-7 w-7 text-primary" />
                        </div>
                        <p className="text-sm leading-relaxed text-muted-foreground">
                            Hoy el acceso público real se centra en el catálogo general, el carrito y la compra local. Cuando exista un endpoint público de taller, esta ruta podrá mostrar una ficha individual coherente.
                        </p>
                        <div className="mt-6">
                            <Link href="/products">
                                <Button>
                                    Ir al catálogo real
                                    <ArrowRight className="ml-2 h-4 w-4" />
                                </Button>
                            </Link>
                        </div>
                    </div>
                </section>

            </main>
            <Footer />
        </div>
    )
}
