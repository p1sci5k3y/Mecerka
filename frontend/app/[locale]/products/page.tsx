"use client"

import { useEffect, useState } from "react"
import { Search, SlidersHorizontal, Loader2, PackageX } from "lucide-react"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { ProductCard } from "@/components/product-card"
import { productsService } from "@/lib/services/products-service"
import { Input } from "@/components/ui/input"
import type { Product } from "@/lib/types"

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [selectedCity, setSelectedCity] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("")

  useEffect(() => {
    productsService
      .getAll()
      .then((data) => {
        setProducts(data)
        setLoading(false)
      })
      .catch(() => {
        setError("No se pudieron cargar los productos")
        setLoading(false)
      })
  }, [])

  const cities = [...new Set(products.map((p) => p.city))].sort()
  const categories = [...new Set(products.map((p) => p.category))].sort()

  const filtered = products.filter((p) => {
    const matchSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.description.toLowerCase().includes(search.toLowerCase())
    const matchCity = !selectedCity || p.city === selectedCity
    const matchCategory = !selectedCategory || p.category === selectedCategory
    return matchSearch && matchCity && matchCategory
  })

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
          <div className="mb-8">
            <h1 className="font-display text-3xl font-bold text-foreground">
              Catálogo de productos
            </h1>
            <p className="mt-1 text-muted-foreground">
              Explora todos los productos disponibles en tu ciudad
            </p>
          </div>

          <div className="mb-10 flex flex-col gap-4">
            <div className="relative max-w-2xl">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground/70" />
              <Input
                placeholder="Busca por pieza, taller o técnica..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-14 pl-12 rounded-full border-2 border-border/60 bg-card text-base shadow-sm focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary transition-all"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mr-2">
                <SlidersHorizontal className="h-4 w-4" />
                Filtrar por:
              </div>

              <div className="relative group">
                <select
                  value={selectedCity}
                  onChange={(e) => setSelectedCity(e.target.value)}
                  className="appearance-none h-10 rounded-full border border-border/80 bg-background/50 pl-5 pr-10 text-sm font-medium text-foreground outline-none hover:border-primary/50 focus:border-primary transition-colors cursor-pointer shadow-sm"
                >
                  <option value="">Cualquier ciudad</option>
                  {cities.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2">
                  <span className="text-xs">▼</span>
                </div>
              </div>

              <div className="relative group">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="appearance-none h-10 rounded-full border border-border/80 bg-background/50 pl-5 pr-10 text-sm font-medium text-foreground outline-none hover:border-primary/50 focus:border-primary transition-colors cursor-pointer shadow-sm"
                >
                  <option value="">Cualquier técnica/categoría</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2">
                  <span className="text-xs">▼</span>
                </div>
              </div>
            </div>
          </div>

          {/* Content */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="mt-3 text-sm text-muted-foreground">
                Cargando productos...
              </p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-20">
              <PackageX className="h-12 w-12 text-muted-foreground/50" />
              <p className="mt-3 text-sm text-muted-foreground">{error}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <PackageX className="h-12 w-12 text-muted-foreground/50" />
              <p className="mt-3 text-sm text-muted-foreground">
                No se encontraron productos con estos filtros
              </p>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  )
}
