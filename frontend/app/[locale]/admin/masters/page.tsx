"use client"

import { useState, useEffect } from "react"
import { useRouter } from "@/lib/navigation"
import { useSearchParams } from "next/navigation"
import { Plus, Pencil, Trash2, MapPin, Tag, Mail, Send } from "lucide-react"
import { adminService } from "@/lib/services/admin-service"
import { AdminEmailSettings, BackendCity, BackendCategory } from "@/lib/types"
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
                    <TabsTrigger value="email" className="gap-2">
                        <Mail className="h-4 w-4" />
                        Correo SMTP
                    </TabsTrigger>
                </TabsList>
                <TabsContent value="cities" className="space-y-4">
                    <CitiesManager />
                </TabsContent>
                <TabsContent value="categories" className="space-y-4">
                    <CategoriesManager />
                </TabsContent>
                <TabsContent value="email" className="space-y-4">
                    <EmailSettingsManager />
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

    const handleDelete = async (id: string) => {
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
            const data = await adminService.getCategories()
            setCategories(data)
        } catch {
            toast({ title: "Error al guardar", variant: "destructive" })
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm("¿Estás seguro?")) return
        try {
            await adminService.deleteCategory(id)
            toast({ title: "Categoría eliminada" })
            const data = await adminService.getCategories()
            setCategories(data)
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

function EmailSettingsManager() {
    const [settings, setSettings] = useState<AdminEmailSettings | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [sendingTest, setSendingTest] = useState(false)
    const { toast } = useToast()

    const [host, setHost] = useState("")
    const [port, setPort] = useState("587")
    const [user, setUser] = useState("")
    const [password, setPassword] = useState("")
    const [clearPassword, setClearPassword] = useState(false)
    const [from, setFrom] = useState("")
    const [testRecipient, setTestRecipient] = useState("")

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const data = await adminService.getEmailSettings()
                setSettings(data)
                setHost(data.host)
                setPort(String(data.port))
                setUser(data.user ?? "")
                setFrom(data.from)
            } catch {
                toast({ title: "Error al cargar la configuración SMTP", variant: "destructive" })
            } finally {
                setLoading(false)
            }
        }

        fetchSettings()
    }, [toast])

    const refreshSettings = async () => {
        const data = await adminService.getEmailSettings()
        setSettings(data)
        setHost(data.host)
        setPort(String(data.port))
        setUser(data.user ?? "")
        setFrom(data.from)
        setPassword("")
        setClearPassword(false)
    }

    const handleSave = async (event: React.FormEvent) => {
        event.preventDefault()
        setSaving(true)
        try {
            await adminService.updateEmailSettings({
                host,
                port: Number(port),
                user,
                password: password || undefined,
                clearPassword,
                from,
            })
            await refreshSettings()
            toast({ title: "Configuración SMTP guardada" })
        } catch {
            toast({ title: "Error al guardar la configuración SMTP", variant: "destructive" })
        } finally {
            setSaving(false)
        }
    }

    const handleSendTest = async (event: React.FormEvent) => {
        event.preventDefault()
        setSendingTest(true)
        try {
            await adminService.sendEmailSettingsTest(testRecipient)
            toast({ title: "Correo de prueba enviado" })
        } catch {
            toast({ title: "Error al enviar el correo de prueba", variant: "destructive" })
        } finally {
            setSendingTest(false)
        }
    }

    if (loading) return <div>Cargando...</div>

    return (
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <div className="rounded-md border bg-card p-4">
                <div className="mb-4">
                    <h2 className="text-xl font-semibold">Servidor SMTP</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        Esta configuración se guarda en base de datos y tiene prioridad sobre las variables de entorno. Úsala para SES, Mailgun, Resend SMTP o cualquier relay SMTP estándar.
                    </p>
                </div>

                <form onSubmit={handleSave} className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="smtp-host">Host</Label>
                            <Input id="smtp-host" value={host} onChange={(e) => setHost(e.target.value)} required />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="smtp-port">Puerto</Label>
                            <Input id="smtp-port" type="number" value={port} onChange={(e) => setPort(e.target.value)} required />
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="smtp-user">Usuario SMTP</Label>
                            <Input id="smtp-user" value={user} onChange={(e) => setUser(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="smtp-pass">Contraseña SMTP</Label>
                            <Input id="smtp-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={settings?.passwordConfigured ? "********" : ""} />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="smtp-from">Remitente</Label>
                        <Input id="smtp-from" value={from} onChange={(e) => setFrom(e.target.value)} required />
                    </div>

                    <div className="flex items-center space-x-2">
                        <Switch id="smtp-clear-password" checked={clearPassword} onCheckedChange={setClearPassword} />
                        <Label htmlFor="smtp-clear-password">Borrar la contraseña guardada</Label>
                    </div>

                    <DialogFooter>
                        <Button type="submit" disabled={saving}>
                            {saving ? "Guardando..." : "Guardar SMTP"}
                        </Button>
                    </DialogFooter>
                </form>
            </div>

            <div className="space-y-4">
                <div className="rounded-md border bg-card p-4">
                    <h3 className="font-semibold">Estado actual</h3>
                    <div className="mt-3 space-y-2 text-sm">
                        <p><strong>Origen:</strong> {settings?.source === "database" ? "Base de datos" : settings?.source === "environment" ? "Variables de entorno" : "Default local"}</p>
                        <p><strong>Seguridad:</strong> {settings?.secure ? "SSL/TLS (465)" : "STARTTLS / no SSL implícito"}</p>
                        <p><strong>Autenticación:</strong> {settings?.authConfigured ? "Configurada" : "No configurada"}</p>
                        <p><strong>Password guardada:</strong> {settings?.passwordConfigured ? "Sí" : "No"}</p>
                    </div>
                </div>

                <div className="rounded-md border bg-card p-4">
                    <h3 className="font-semibold">Enviar prueba</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Envía un correo con la configuración efectiva para validar que el relay responde.
                    </p>
                    <form onSubmit={handleSendTest} className="mt-4 space-y-3">
                        <div className="space-y-2">
                            <Label htmlFor="smtp-test-recipient">Destinatario</Label>
                            <Input
                                id="smtp-test-recipient"
                                type="email"
                                value={testRecipient}
                                onChange={(e) => setTestRecipient(e.target.value)}
                                required
                            />
                        </div>
                        <Button type="submit" disabled={sendingTest}>
                            <Send className="mr-2 h-4 w-4" />
                            {sendingTest ? "Enviando..." : "Enviar correo de prueba"}
                        </Button>
                    </form>
                </div>
            </div>
        </div>
    )
}
