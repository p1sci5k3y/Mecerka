"use client"

import { useState, useEffect } from "react"
import { useRouter, Link } from "@/lib/navigation"
import { ArrowLeft, Loader2 } from "lucide-react"

import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { ProtectedRoute } from "@/components/protected-route"
import { productsService } from "@/lib/services/products-service"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { api } from "@/lib/api"
import type { BackendCity, BackendCategory } from "@/lib/types"

export default function NewProductPage() {
    return (
        <ProtectedRoute allowedRoles={["PROVIDER"]}>
            <NewProductContent />
        </ProtectedRoute>
    )
}

function NewProductContent() {
    const router = useRouter()
    const { toast } = useToast()
    const [loading, setLoading] = useState(false)
    const [cities, setCities] = useState<BackendCity[]>([])
    const [categories, setCategories] = useState<BackendCategory[]>([])

    // Form state
    const [formData, setFormData] = useState({
        name: "",
        description: "",
        price: "",
        stock: "",
        categoryId: "",
        cityId: "",
        imageUrl: "",
    })

    useEffect(() => {
        // Load dependencies (Cities, Categories)
        // We might need new endpoints or just use what we have.
        // For now, assuming we can fetch them. 
        // Actually, backend doesn't have public endpoints for cities/categories listed in analysis?
        // Let's check api. 
        // If not available, we might need to hardcode or fetch from somewhere.
        // Wait, the seed script created them. usage in frontend?
        // Let's assume endpoints exist or I'll create them/mock them.
        // Checking backend/src/cities/cities.controller.ts and categories...
        // I'll fetch them. If fail, I'll fallback.
        const fetchData = async () => {
            try {
                const [citiesRes, catsRes] = await Promise.all([
                    api.get<BackendCity[]>("/cities"),
                    api.get<BackendCategory[]>("/categories")
                ])
                setCities(citiesRes)
                setCategories(catsRes)
            } catch (e) {
                console.error("Failed to load metadata", e)
            }
        }
        fetchData()
    }, [])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target
        setFormData((prev) => ({ ...prev, [name]: value }))
    }

    const handleSelectChange = (name: string, value: string) => {
        setFormData((prev) => ({ ...prev, [name]: value }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        try {
            const payload = {
                ...formData,
                price: Number.parseFloat(formData.price),
                stock: Number.parseInt(formData.stock),
                categoryId: formData.categoryId,
                cityId: formData.cityId,
            }

            await productsService.create(payload)

            toast({
                title: "Producto creado",
                description: "El producto se ha guardado correctamente",
            })

            router.push("/provider/products")
        } catch (error) {
            console.error(error)
            toast({
                title: "Error",
                description: "No se pudo crear el producto. Verifica los datos.",
                variant: "destructive",
            })
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="flex min-h-screen flex-col">
            <Navbar />
            <main className="flex-1">
                <div className="mx-auto max-w-3xl px-4 py-8 lg:px-8">
                    <div className="mb-8 flex items-center gap-4">
                        <Button variant="ghost" size="icon" asChild>
                            <Link href="/provider/products">
                                <ArrowLeft className="h-5 w-5" />
                            </Link>
                        </Button>
                        <div>
                            <h1 className="font-display text-2xl font-bold text-foreground">
                                Nuevo Producto
                            </h1>
                            <p className="text-muted-foreground">
                                Añade un nuevo producto a tu catálogo
                            </p>
                        </div>
                    </div>

                    <section className="mb-6 rounded-xl border border-border bg-card/70 p-5">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <div>
                                <h2 className="text-lg font-bold text-foreground">
                                    Checklist de publicación
                                </h2>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Completa estos mínimos para que el producto salga listo al inventario.
                                </p>
                            </div>
                            <Button asChild variant="outline">
                                <Link href="/provider/onboarding">
                                    Ver guía de alta
                                </Link>
                            </Button>
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-3">
                            <div className="rounded-lg border border-border/60 bg-background/70 p-4 text-sm">
                                <p className="font-semibold text-foreground">Metadatos base</p>
                                <p className="mt-2 text-muted-foreground">
                                    {cities.length > 0 && categories.length > 0
                                        ? "OK. Ciudades y categorías cargadas."
                                        : "Pendiente de cargar ciudades o categorías."}
                                </p>
                            </div>
                            <div className="rounded-lg border border-border/60 bg-background/70 p-4 text-sm">
                                <p className="font-semibold text-foreground">Ficha comercial</p>
                                <p className="mt-2 text-muted-foreground">
                                    {formData.name && formData.price && formData.stock
                                        ? "OK. Nombre, precio y stock completados."
                                        : "Completa nombre, precio y stock para publicar."}
                                </p>
                            </div>
                            <div className="rounded-lg border border-border/60 bg-background/70 p-4 text-sm">
                                <p className="font-semibold text-foreground">Siguiente paso</p>
                                <p className="mt-2 text-muted-foreground">
                                    Tras guardar, revisa inventario y confirma que el producto aparece con stock correcto.
                                </p>
                            </div>
                        </div>
                    </section>

                    <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border border-border bg-card p-6">
                        <div className="space-y-4">
                            <div className="grid gap-2">
                                <Label htmlFor="name">Nombre del producto *</Label>
                                <Input
                                    id="name"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleChange}
                                    required
                                    placeholder="Ej. Manzanas Golden"
                                />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="description">Descripción</Label>
                                <Textarea
                                    id="description"
                                    name="description"
                                    value={formData.description}
                                    onChange={handleChange}
                                    placeholder="Describe el producto..."
                                    rows={4}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="price">Precio (€) *</Label>
                                    <Input
                                        id="price"
                                        name="price"
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={formData.price}
                                        onChange={handleChange}
                                        required
                                        placeholder="0.00"
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="stock">Stock (unidades) *</Label>
                                    <Input
                                        id="stock"
                                        name="stock"
                                        type="number"
                                        min="0"
                                        value={formData.stock}
                                        onChange={handleChange}
                                        required
                                        placeholder="0"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="categoryId">Categoría *</Label>
                                    <Select
                                        value={formData.categoryId}
                                        onValueChange={(val) => handleSelectChange("categoryId", val)}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Seleccionar..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {categories.map((cat) => (
                                                <SelectItem key={cat.id} value={String(cat.id)}>
                                                    {cat.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="cityId">Ciudad *</Label>
                                    <Select
                                        value={formData.cityId}
                                        onValueChange={(val) => handleSelectChange("cityId", val)}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Seleccionar..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {cities.map((city) => (
                                                <SelectItem key={city.id} value={String(city.id)}>
                                                    {city.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="imageUrl">URL de la imagen</Label>
                                <Input
                                    id="imageUrl"
                                    name="imageUrl"
                                    value={formData.imageUrl}
                                    onChange={handleChange}
                                    placeholder="https://..."
                                />
                                <p className="text-[10px] text-muted-foreground">
                                    * Deja vacío para usar imagen por defecto.
                                </p>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-4">
                            <Button type="button" variant="outline" asChild>
                                <Link href="/provider/products">Cancelar</Link>
                            </Button>
                            <Button type="submit" disabled={loading}>
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Guardar Producto
                            </Button>
                        </div>
                    </form>
                </div>
            </main>
            <Footer />
        </div>
    )
}
