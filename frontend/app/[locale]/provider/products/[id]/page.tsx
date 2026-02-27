"use client"

import { useState, useEffect } from "react"
import { Link, useRouter } from "@/lib/navigation"
import { useParams } from "next/navigation" // useParams stays from next/navigation as per next-intl docs usually, or check lib
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
import { api } from "@/lib/api"
import type { BackendCity, BackendCategory, BackendProduct } from "@/lib/types"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

export default function EditProductPage() {
    return (
        <ProtectedRoute allowedRoles={["PROVIDER"]}>
            <EditProductContent />
        </ProtectedRoute>
    )
}

function EditProductContent() {
    const router = useRouter()
    const params = useParams()
    const id = params.id as string
    const { toast } = useToast()

    const [loading, setLoading] = useState(false)
    const [initialLoading, setInitialLoading] = useState(true)
    const [cities, setCities] = useState<BackendCity[]>([])
    const [categories, setCategories] = useState<BackendCategory[]>([])

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
        const fetchData = async () => {
            try {
                const [citiesRes, catsRes, productRes] = await Promise.all([
                    api.get<BackendCity[]>("/cities"),
                    api.get<BackendCategory[]>("/categories"),
                    api.get<BackendProduct>(`/products/${id}`)
                ])
                setCities(citiesRes)
                setCategories(catsRes)

                setFormData({
                    name: productRes.name,
                    description: productRes.description || "",
                    price: productRes.price,
                    stock: String(productRes.stock),
                    categoryId: String(productRes.categoryId),
                    cityId: String(productRes.cityId),
                    imageUrl: productRes.imageUrl || ""
                })
            } catch (e) {
                console.error("Failed to load product", e)
                toast({
                    title: "Error",
                    description: "No se pudo cargar la información del producto",
                    variant: "destructive",
                })
                router.push("/provider/products")
            } finally {
                setInitialLoading(false)
            }
        }
        fetchData()
    }, [id, router, toast])

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
                name: formData.name,
                description: formData.description,
                price: Number.parseFloat(formData.price),
                stock: Number.parseInt(formData.stock),
                categoryId: Number.parseInt(formData.categoryId),
                cityId: Number.parseInt(formData.cityId),
                imageUrl: formData.imageUrl
            }

            await productsService.update(id, payload)

            toast({
                title: "Producto actualizado",
                description: "Los cambios se han guardado correctamente",
            })

            router.push("/provider/products")
        } catch (error) {
            toast({
                title: "Error",
                description: "No se pudo actualizar el producto",
                variant: "destructive",
            })
        } finally {
            setLoading(false)
        }
    }

    if (initialLoading) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
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
                                Editar Producto
                            </h1>
                            <p className="text-muted-foreground">
                                Modifica los detalles de tu producto
                            </p>
                        </div>
                    </div>

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
                                />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="description">Descripción</Label>
                                <Textarea
                                    id="description"
                                    name="description"
                                    value={formData.description}
                                    onChange={handleChange}
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
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-4">
                            <Button type="button" variant="outline" asChild>
                                <Link href="/provider/products">Cancelar</Link>
                            </Button>
                            <Button type="submit" disabled={loading}>
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Guardar Cambios
                            </Button>
                        </div>
                    </form>
                </div>
            </main>
            <Footer />
        </div>
    )
}
