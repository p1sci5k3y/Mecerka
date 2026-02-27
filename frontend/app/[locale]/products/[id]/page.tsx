"use client"

import { useEffect, useState } from "react"
import { useRouter } from "@/lib/navigation"
import { useParams } from "next/navigation"
import {
  ArrowLeft,
  MapPin,
  ShoppingCart,
  Package,
  Loader2,
  Minus,
  Plus,
  Sparkles,
} from "lucide-react"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { productsService } from "@/lib/services/products-service"
import { useCart } from "@/contexts/cart-context"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import type { Product } from "@/lib/types"

export default function ProductDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { addItem, cityConflict } = useCart()
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [quantity, setQuantity] = useState(1)

  useEffect(() => {
    if (!params.id) return
    productsService
      .getById(params.id as string)
      .then((data) => {
        setProduct(data)
        setLoading(false)
      })
      .catch(() => {
        setLoading(false)
      })
  }, [params.id])

  const handleAddToCart = () => {
    if (!product) return
    addItem(product, quantity)
    if (!cityConflict) {
      toast.success(`${product.name} (x${quantity}) añadido al carrito`)
    }
  }

  useEffect(() => {
    if (cityConflict) {
      toast.error(cityConflict)
    }
  }, [cityConflict])

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
          <button
            type="button"
            onClick={() => router.back()}
            className="mb-6 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al catálogo
          </button>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : !product ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Package className="h-12 w-12 text-muted-foreground/50" />
              <p className="mt-3 text-muted-foreground">Producto no encontrado</p>
            </div>
          ) : (
            <div className="grid gap-8 lg:grid-cols-2">
              <div className="flex aspect-square items-center justify-center rounded-xl border border-border bg-secondary overflow-hidden">
                {product.imageUrl ? (
                  <img src={product.imageUrl} alt={product.name} className="object-cover w-full h-full" />
                ) : (
                  <img src="https://images.unsplash.com/photo-1606760227091-3dd870d97f1d?q=80&w=600&auto=format&fit=crop" alt="Artesanía por defecto" className="object-cover w-full h-full opacity-80" />
                )}
              </div>

              {/* Info */}
              <div className="flex flex-col">
                <div className="flex flex-wrap items-center gap-2">
                  {product.category && (
                    <Badge variant="secondary">{product.category}</Badge>
                  )}
                  <Badge variant="outline" className="gap-1">
                    <MapPin className="h-3 w-3" />
                    {product.city}
                  </Badge>
                </div>

                <h1 className="mt-4 font-display text-3xl font-bold text-foreground text-balance">
                  {product.name}
                </h1>

                <p className="mt-4 leading-relaxed text-muted-foreground">
                  {product.description}
                </p>

                <div className="mt-6 flex items-baseline gap-2">
                  <span className="font-display text-4xl font-bold text-foreground">
                    {product.price.toFixed(2)}
                  </span>
                  <span className="text-lg text-muted-foreground">&euro;</span>
                </div>

                <p className="mt-2 text-sm text-muted-foreground">
                  {product.stock > 0
                    ? `${product.stock} unidades disponibles`
                    : "Sin stock"}
                </p>

                {product.stock > 0 && (
                  <div className="mt-6 flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-foreground">Cantidad</span>
                      <div className="flex items-center gap-1 rounded-lg border border-border">
                        <button
                          type="button"
                          className="flex h-9 w-9 items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => setQuantity(Math.max(1, quantity - 1))}
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="w-10 text-center text-sm font-medium text-foreground">
                          {quantity}
                        </span>
                        <button
                          type="button"
                          className="flex h-9 w-9 items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() =>
                            setQuantity(Math.min(product.stock, quantity + 1))
                          }
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <Button size="lg" className="gap-2" onClick={handleAddToCart}>
                      <ShoppingCart className="h-4 w-4" />
                      Añadir al carrito
                    </Button>
                  </div>
                )}

                {/* Mock recommendations */}
                <div className="mt-10 rounded-xl border border-dashed border-border bg-secondary/50 p-5">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Sparkles className="h-4 w-4 text-primary" />
                    Productos similares - Coming soon
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Recomendaciones basadas en categoría y ciudad (ML-ready).
                    Integración de backend pendiente.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  )
}
