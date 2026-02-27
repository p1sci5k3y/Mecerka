"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { ordersService } from "@/lib/services/orders-service"
import { Order } from "@/lib/types"
import { ProtectedRoute } from "@/components/protected-route"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Package, MapPin, CheckCircle, Clock } from "lucide-react"
import { TagChip } from "@/components/ui/tag-chip"
import { SealBadge } from "@/components/ui/seal-badge"

export default function RunnerDashboard() {
    return (
        <ProtectedRoute allowedRoles={["RUNNER"]}>
            <div className="flex min-h-screen flex-col bg-background selection:bg-primary/20">
                <Navbar />
                <main className="flex-1">
                    <RunnerContent />
                </main>
                <Footer />
            </div>
        </ProtectedRoute>
    )
}

function RunnerContent() {
    const [availableOrders, setAvailableOrders] = useState<Order[]>([])
    const [myDeliveries, setMyDeliveries] = useState<Order[]>([])
    const [loading, setLoading] = useState(true)

    const fetchData = async () => {
        setLoading(true)
        try {
            const [available, mine] = await Promise.all([
                ordersService.getAvailable(),
                ordersService.getAll()
            ])

            setAvailableOrders(available)
            setMyDeliveries(mine)
        } catch (error) {
            toast.error("Error al cargar pedidos")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
    }, [])

    const handleAccept = async (orderId: string) => {
        try {
            await ordersService.accept(orderId)
            toast.success("¡Pedido aceptado para entrega!")
            fetchData()
        } catch (e: any) {
            toast.error(e?.response?.data?.message || "Error al aceptar pedido")
        }
    }

    const handleComplete = async (orderId: string) => {
        try {
            await ordersService.complete(orderId)
            toast.success("¡Entrega completada!")
            fetchData()
        } catch (e: any) {
            toast.error(e?.response?.data?.message || "Error al completar pedido")
        }
    }

    if (loading) {
        return (
            <div className="flex h-[50vh] items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
            </div>
        )
    }

    return (
        <>
            {/* Editorial Header */}
            <div className="bg-primary/5 border-b border-border/60 py-12 relative overflow-hidden">
                <div className="container relative z-10 px-4 md:px-6 max-w-7xl">
                    <SealBadge className="mb-4 shadow-none bg-background border-primary/20">Logística Local</SealBadge>
                    <h1 className="font-display text-3xl font-extrabold text-foreground tracking-tight sm:text-4xl">
                        Panel de Repartidor
                    </h1>
                    <p className="mt-2 text-foreground/80 font-medium">
                        Conecta los talleres con el barrio de manera justa y sostenible.
                    </p>
                </div>
            </div>

            <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
                <div className="grid gap-10 lg:grid-cols-2">
                    {/* Available Orders Section */}
                    <section>
                        <div className="mb-6 flex items-center gap-2 border-b border-border/50 pb-4">
                            <Clock className="h-5 w-5 text-muted-foreground" />
                            <h2 className="font-display text-2xl font-bold">En el Barrio ({availableOrders.length})</h2>
                        </div>

                        <div className="space-y-4">
                            {availableOrders.length === 0 ? (
                                <div className="rounded-2xl border-2 border-dashed border-border/60 bg-muted/20 py-12 text-center">
                                    <p className="text-muted-foreground font-medium">Todo al día. No hay envíos pendientes.</p>
                                </div>
                            ) : (
                                availableOrders.map((order) => (
                                    <div key={order.id} className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm hover:shadow-md transition-shadow">
                                        <div className="flex justify-between items-start mb-4">
                                            <div>
                                                <TagChip variant="outline" className="font-mono text-xs">
                                                    REF #{order.id.slice(-6).toUpperCase()}
                                                </TagChip>
                                                <p className="mt-2 text-sm text-muted-foreground font-medium">
                                                    {new Date(order.createdAt).toLocaleString("es-ES", {
                                                        day: "numeric", month: "long", hour: "2-digit", minute: "2-digit"
                                                    })}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-display text-xl font-black text-primary">{order.total.toLocaleString("es-ES", { style: "currency", currency: "EUR" })}</p>
                                                <p className="text-xs font-semibold text-muted-foreground mt-0.5">{order.items.length} piezas</p>
                                            </div>
                                        </div>

                                        <div className="mb-6 space-y-3 bg-muted/30 p-4 rounded-xl border border-border/50">
                                            <div className="flex items-center gap-3">
                                                <div className="h-8 w-8 shrink-0 rounded-full bg-background flex items-center justify-center border border-border shadow-sm">
                                                    <MapPin className="h-4 w-4 text-primary" />
                                                </div>
                                                <p className="text-sm font-medium text-foreground">
                                                    Entregar en: {order.deliveryAddress || order.city}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="h-8 w-8 shrink-0 rounded-full bg-background flex items-center justify-center border border-border shadow-sm">
                                                    <Package className="h-4 w-4 text-muted-foreground" />
                                                </div>
                                                <p className="text-sm font-medium text-foreground text-ellipsis overflow-hidden whitespace-nowrap">
                                                    Recoger de: {order.items[0]?.product?.providerId} {order.items.length > 1 ? `(+${order.items.length - 1})` : ''}
                                                </p>
                                            </div>
                                        </div>

                                        <Button
                                            className="w-full font-bold h-12 shadow-sm rounded-xl text-base"
                                            onClick={() => handleAccept(order.id)}
                                        >
                                            Asignarme Ruta
                                        </Button>
                                    </div>
                                ))
                            )}
                        </div>
                    </section>

                    {/* My Deliveries Section */}
                    <section>
                        <div className="mb-6 flex items-center gap-2 border-b border-border/50 pb-4">
                            <CheckCircle className="h-5 w-5 text-primary" />
                            <h2 className="font-display text-2xl font-bold">Tus Entregas ({myDeliveries.length})</h2>
                        </div>

                        <div className="space-y-4">
                            {myDeliveries.length === 0 ? (
                                <div className="rounded-2xl border-2 border-dashed border-border/60 bg-muted/20 py-12 text-center">
                                    <p className="text-muted-foreground font-medium">Aún no has reclamado ninguna ruta.</p>
                                </div>
                            ) : (
                                myDeliveries.map((order) => (
                                    <div key={order.id} className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm">
                                        <div className="flex justify-between items-start mb-6">
                                            <div>
                                                <TagChip variant={order.status === "CONFIRMED" ? "accent" : "default"} className="mb-2">
                                                    {order.status === "CONFIRMED" ? "En Camino" : order.status}
                                                </TagChip>
                                                <p className="font-mono text-xs text-muted-foreground font-medium">
                                                    #{order.id.toUpperCase()}
                                                </p>
                                                {order.deliveryAddress && (
                                                    <p className="text-sm mt-2 text-foreground break-words font-medium">
                                                        Destino: {order.deliveryAddress}
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        {order.status === "CONFIRMED" && (
                                            <div className="space-y-3">
                                                <Button
                                                    asChild
                                                    variant="outline"
                                                    className="w-full h-12 rounded-xl text-base font-bold shadow-sm border-primary/20 hover:bg-primary/5"
                                                >
                                                    <a href={`/orders/${order.id}/track`}>
                                                        <MapPin className="mr-2 h-4 w-4" />
                                                        Ir al Mapa & Emitir GPS
                                                    </a>
                                                </Button>
                                                <Button
                                                    variant="default"
                                                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold h-12 rounded-xl text-base shadow-sm"
                                                    onClick={() => handleComplete(order.id)}
                                                >
                                                    Registrar Entrega
                                                </Button>
                                            </div>
                                        )}
                                        {order.status === "DELIVERED" && (
                                            <Button variant="outline" className="w-full h-12 rounded-xl border-dashed font-semibold" disabled>
                                                Entregado Exitosamente
                                            </Button>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </section>
                </div>
            </div>
        </>
    )
}
