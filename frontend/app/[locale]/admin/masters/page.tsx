"use client"

import { useState, useEffect } from "react"
import { useRouter } from "@/lib/navigation"
import { useSearchParams } from "next/navigation"
import { Plus, Pencil, Trash2, MapPin, Tag } from "lucide-react"
import { adminService } from "@/lib/services/admin-service"
import { BackendCity, BackendCategory } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { useToast } from "@/components/ui/use-toast"

export default function MastersPage() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const currentTab = searchParams.get("tab") || "cities"

    const onTabChange = (value: string) => {
        router.push(`/admin/masters?tab=${value}`)
    }

    return (
        <div>
            <h1 className="mb-8 font-display text-3xl font-bold">Datos Maestros</h1>
            <Tabs value={currentTab} onValueChange={onTabChange} className="space-y-4">
                <TabsList>
                    <TabsTrigger value="cities" className="gap-2">
                        <MapPin className="h-4 w-4" />
                        Ciudades
                    </TabsTrigger>
                    <TabsTrigger value="categories" className="gap-2">
                        <Tag className="h-4 w-4" />
                        Categorías
                    </TabsTrigger>
                </TabsList>
                <TabsContent value="cities" className="space-y-4">
                    <CitiesManager />
                </TabsContent>
                <TabsContent value="categories" className="space-y-4">
                    <CategoriesManager />
                </TabsContent>
            </Tabs>
        </div>
    )
}

function CitiesManager() {
    const [cities, setCities] = useState<BackendCity[]>([])
    const [loading, setLoading] = useState(true)
    const [isOpen, setIsOpen] = useState(false)
    const [editingCity, setEditingCity] = useState<BackendCity | null>(null)
    const { toast } = useToast()

    // Form state
    const [name, setName] = useState("")
    const [slug, setSlug] = useState("")
    const [active, setActive] = useState(true)

    useEffect(() => {
        const fetchCities = async () => {
            try {
                const data = await adminService.getCities()
                setCities(data)
            } catch {
                toast({ title: "Error al cargar ciudades", variant: "destructive" })
            } finally {
                setLoading(false)
            }
        }
        fetchCities()
    }, [toast])

    const openCreate = () => {
        setEditingCity(null)
        setName("")
        setSlug("")
        setActive(true)
        setIsOpen(true)
    }

    const openEdit = (city: BackendCity) => {
        setEditingCity(city)
        setName(city.name)
        setSlug(city.slug || "") // Assuming slug might be missing in type but present in backend
        // setActive(city.active) // Type might not have active yet in frontend/lib/types.ts?
        // Let's assume backend sends it.
        setActive(true)
        setIsOpen(true)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            if (editingCity) {
                await adminService.updateCity(editingCity.id, { name, slug, active })
                toast({ title: "Ciudad actualizada" })
            } else {
                await adminService.createCity({ name, slug, active })
                toast({ title: "Ciudad creada" })
            }
            setIsOpen(false)
            // Re-fetch cities after an update or create
            const data = await adminService.getCities()
            setCities(data)
        } catch {
            toast({ title: "Error al guardar", variant: "destructive" })
        }
    }

    const handleDelete = async (id: number) => {
        if (!confirm("¿Estás seguro?")) return
        try {
            await adminService.deleteCity(id)
            toast({ title: "Ciudad eliminada" })
            // Re-fetch cities after deletion
            const data = await adminService.getCities()
            setCities(data)
        } catch {
            toast({ title: "Error al eliminar (puede tener relaciones)", variant: "destructive" })
        }
    }

    if (loading) return <div>Cargando...</div>

    return (
        <div className="rounded-md border bg-card p-4">
            <div className="mb-4 flex justify-between">
                <h2 className="text-xl font-semibold">Listado de Ciudades</h2>
                <Dialog open={isOpen} onOpenChange={setIsOpen}>
                    <Button onClick={openCreate}>
                        <Plus className="mr-2 h-4 w-4" />
                        Nueva Ciudad
                    </Button>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{editingCity ? "Editar Ciudad" : "Nueva Ciudad"}</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Nombre</Label>
                                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="slug">Slug</Label>
                                <Input id="slug" value={slug} onChange={(e) => setSlug(e.target.value)} required />
                            </div>
                            <div className="flex items-center space-x-2">
                                <Switch id="active" checked={active} onCheckedChange={setActive} />
                                <Label htmlFor="active">Activa</Label>
                            </div>
                            <DialogFooter>
                                <Button type="submit">Guardar</Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Acciones</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {cities.map((city) => (
                        <TableRow key={city.id}>
                            <TableCell>{city.id}</TableCell>
                            <TableCell>{city.name}</TableCell>
                            <TableCell className="flex gap-2">
                                <Button variant="ghost" size="icon" onClick={() => openEdit(city)}>
                                    <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(city.id)}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    )
}

function CategoriesManager() {
    const [categories, setCategories] = useState<BackendCategory[]>([])
    const [loading, setLoading] = useState(true)
    const [isOpen, setIsOpen] = useState(false)
    const [editingCategory, setEditingCategory] = useState<BackendCategory | null>(null)
    const { toast } = useToast()

    const [name, setName] = useState("")
    const [slug, setSlug] = useState("")
    const [imageUrl, setImageUrl] = useState("")

    useEffect(() => {
        const fetchCategories = async () => {
            try {
                const data = await adminService.getCategories()
                setCategories(data)
            } catch {
                toast({ title: "Error al cargar categorías", variant: "destructive" })
            } finally {
                setLoading(false)
            }
        }
        fetchCategories()
    }, [toast])

    const openCreate = () => {
        setEditingCategory(null)
        setName("")
        setSlug("")
        setImageUrl("")
        setIsOpen(true)
    }

    const openEdit = (cat: BackendCategory) => {
        setEditingCategory(cat)
        setName(cat.name)
        setSlug(cat.slug || "")
        setImageUrl(cat.image_url || "")
        setIsOpen(true)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            if (editingCategory) {
                await adminService.updateCategory(editingCategory.id, { name, slug, image_url: imageUrl })
                toast({ title: "Categoría actualizada" })
            } else {
                await adminService.createCategory({ name, slug, image_url: imageUrl })
                toast({ title: "Categoría creada" })
            }
            setIsOpen(false)
            fetchCategories()
        } catch {
            toast({ title: "Error al guardar", variant: "destructive" })
        }
    }

    const handleDelete = async (id: number) => {
        if (!confirm("¿Estás seguro?")) return
        try {
            await adminService.deleteCategory(id)
            toast({ title: "Categoría eliminada" })
            fetchCategories()
        } catch {
            toast({ title: "Error al eliminar", variant: "destructive" })
        }
    }

    if (loading) return <div>Cargando...</div>

    return (
        <div className="rounded-md border bg-card p-4">
            <div className="mb-4 flex justify-between">
                <h2 className="text-xl font-semibold">Listado de Categorías</h2>
                <Dialog open={isOpen} onOpenChange={setIsOpen}>
                    <Button onClick={openCreate}>
                        <Plus className="mr-2 h-4 w-4" />
                        Nueva Categoría
                    </Button>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{editingCategory ? "Editar Categoría" : "Nueva Categoría"}</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="cat-name">Nombre</Label>
                                <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} required />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="cat-slug">Slug</Label>
                                <Input id="cat-slug" value={slug} onChange={(e) => setSlug(e.target.value)} required />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="cat-image">Imagen URL</Label>
                                <Input id="cat-image" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
                            </div>
                            <DialogFooter>
                                <Button type="submit">Guardar</Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Acciones</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {categories.map((cat) => (
                        <TableRow key={cat.id}>
                            <TableCell>{cat.id}</TableCell>
                            <TableCell>{cat.name}</TableCell>
                            <TableCell className="flex gap-2">
                                <Button variant="ghost" size="icon" onClick={() => openEdit(cat)}>
                                    <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(cat.id)}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    )
}
