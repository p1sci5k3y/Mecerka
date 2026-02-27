"use client"

import { Link } from "@/lib/navigation"
import { MapPin, Inbox, Hammer } from "lucide-react"
import type { Product } from "@/lib/types"
import { useCart } from "@/contexts/cart-context"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { TagChip } from "@/components/ui/tag-chip"

export function ProductCard({ product }: { product: Readonly<Product> }) {
  const { addItem, cityConflict } = useCart()

  const handleAdd = () => {
    addItem(product)
    if (!cityConflict) {
      toast.success(`${product.name} añadido al carrito`)
    }
  }

  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-all hover:shadow-md">
      <Link href={`/products/${product.id}`} className="relative aspect-[4/5] overflow-hidden bg-muted/30 flex items-center justify-center border-b border-border/50">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} className="object-cover w-full h-full transition-transform group-hover:scale-105 duration-500" />
        ) : (
          <img src="https://images.unsplash.com/photo-1606760227091-3dd870d97f1d?q=80&w=600&auto=format&fit=crop" alt="Artesanía por defecto" className="object-cover w-full h-full transition-transform group-hover:scale-105 duration-500 opacity-80" />
        )}

        {product.category && (
          <div className="absolute left-3 top-3">
            <TagChip variant="outline" className="bg-background/90 backdrop-blur-sm shadow-sm">
              {product.category}
            </TagChip>
          </div>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <Link href={`/products/${product.id}`}>
          <h3 className="font-display text-lg font-bold text-foreground line-clamp-1 group-hover:text-primary transition-colors leading-tight">
            {product.name}
          </h3>
        </Link>
        <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
          {product.description}
        </p>

        <div className="mt-auto pt-4 flex flex-col gap-4 border-t border-border/60">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <MapPin className="h-3.5 w-3.5 opacity-70" />
            Hecho en {product.city}
          </div>

          <div className="flex items-center justify-between">
            <span className="font-display text-xl font-bold text-foreground">
              {product.price.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
            </span>
            <Button size="sm" variant="outline" onClick={handleAdd} className="gap-2 shrink-0 shadow-sm font-semibold rounded-full px-5 border-primary/20 bg-primary/5 hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors">
              <Inbox className="h-4 w-4" />
              Añadir
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
