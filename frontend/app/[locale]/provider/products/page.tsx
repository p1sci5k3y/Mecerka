"use client"

import { useEffect, useState } from "react"
import { Plus, Edit, Trash2, Package, Loader2, MapPin, Tag } from "lucide-react"
import { Link, useRouter } from "@/lib/navigation"

import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { ProtectedRoute } from "@/components/protected-route" // Import ProtectedRoute
import { useAuth } from "@/contexts/auth-context" // Import useAuth
import { productsService } from "@/lib/services/products-service"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import type { Product } from "@/lib/types"

export default function ProviderProductsPage() {
    return (
        <ProtectedRoute allowedRoles={["PROVIDER"]}>
            <ProductsContent />
        </ProtectedRoute>
    )
}

function ProductsContent() {
    const { toast } = useToast()
    const [products, setProducts] = useState<Product[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        loadProducts()
    }, [])

    const loadProducts = async () => {
        try {
            setLoading(true)
            const data = await productsService.getMyProducts()
            setProducts(data)
        } catch (error) {
            toast({
                title: "Error",
                description: "No se pudieron cargar los productos",
                variant: "destructive",
            })
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm("¿Estás seguro de que quieres eliminar este producto?")) return

        try {
            await productsService.delete(id)
            toast({
                title: "Producto eliminado",
                description: "El producto ha sido eliminado correctamente",
            })
            loadProducts()
        } catch (error) {
            toast({
                title: "Error",
                description: "No se pudo eliminar el producto",
                variant: "destructive",
            })
        }
    }

    return (
        <div className="flex min-h-screen flex-col">
            <Navbar />
            <main className="flex-1">
                <div className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
                    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h1 className="font-display text-3xl font-bold text-foreground">
                                Inventario
                            </h1>
                            <p className="mt-1 text-muted-foreground">
                                Gestiona tus productos y stock
                            </p>
                        </div>
                        <Button asChild>
                            <Link href="/provider/products/new">
                                <Plus className="mr-2 h-4 w-4" />
                                Nuevo Producto
                            </Link>
                        </Button>
                    </div>

                    {loading && (
                        <div className="flex items-center justify-center py-16">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    )}

                    {!loading && products.length === 0 && (
                        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
                            <Package className="h-12 w-12 text-muted-foreground/30" />
                            <h3 className="mt-4 text-lg font-semibold">No tienes productos</h3>
                            <p className="mb-4 mt-2 text-sm text-muted-foreground">
                                Empieza añadiendo tu primer producto a la tienda via el botón "Nuevo Producto".
                            </p>
                            <Button asChild variant="outline">
                                <Link href="/provider/products/new">
                                    <Plus className="mr-2 h-4 w-4" />
                                    Crear Producto
                                </Link>
                            </Button>
                        </div>
                    )}

                    {!loading && products.length > 0 && (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {products.map((product) => (
                                <div
                                    key={product.id}
                                    className="group relative overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/50"
                                >
                                    <div className="aspect-video w-full overflow-hidden bg-muted">
                                        {product.imageUrl ? (
                                            <img
                                                src={product.imageUrl}
                                                alt={product.name}
                                                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                            />
                                        ) : (
                                            <div className="flex h-full w-full items-center justify-center bg-muted">
                                                <img
                                                    src="https://images.unsplash.com/photo-1606760227091-3dd870d97f1d?q=80&w=600&auto=format&fit=crop"
                                                    alt="Artesanía por defecto"
                                                    className="h-full w-full object-cover opacity-80 transition-transform duration-300 group-hover:scale-105"
                                                />
                                            </div>
                                        )}
                                    </div>

                                    <div className="p-4">
                                        <div className="mb-2 flex items-start justify-between gap-2">
                                            <h3 className="font-semibold text-foreground line-clamp-1" title={product.name}>{product.name}</h3>
                                            <Badge variant={product.stock > 0 ? "outline" : "destructive"}>
                                                {product.stock > 0 ? "En stock" : "Agotado"}
                                            </Badge>
                                        </div>

                                        <p className="mb-4 text-sm text-muted-foreground line-clamp-2 h-10">
                                            {product.description}
                                        </p>

                                        <div className="mb-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
                                            <div className="flex items-center gap-1 rounded-md bg-secondary/50 px-2 py-1">
                                                <Tag className="h-3 w-3" />
                                                {product.category}
                                            </div>
                                            <div className="flex items-center gap-1 rounded-md bg-secondary/50 px-2 py-1">
                                                <MapPin className="h-3 w-3" />
                                                {product.city}
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between border-t border-border pt-3">
                                            <span className="font-display text-lg font-bold text-foreground">
                                                {product.price.toFixed(2)} €
                                            </span>
                                            <div className="flex gap-2">
                                                <Button asChild size="icon" variant="ghost" className="h-8 w-8">
                                                    <Link href={`/provider/products/${product.id}`}>
                                                        <Edit className="h-4 w-4" />
                                                        <span className="sr-only">Editar</span>
                                                    </Link>
                                                </Button>
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                                    onClick={() => handleDelete(product.id)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                    <span className="sr-only">Eliminar</span>
                                                </Button>
                                            </div>
                                        </div>
                                        <div className="mt-2 text-xs font-medium text-muted-foreground">
                                            Stock: <span className={product.stock < 10 ? "text-orange-500" : ""}>{product.stock} u.</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>
            <Footer />
        </div>
    )
}
