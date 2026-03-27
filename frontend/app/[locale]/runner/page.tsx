"use client"

import { useEffect, useState } from "react"
import { ordersService } from "@/lib/services/orders-service"
import { Order } from "@/lib/types"
import { ProtectedRoute } from "@/components/protected-route"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import { Link } from "@/lib/navigation"
import { toast } from "sonner"
import { Clock, History, AlertTriangle, CreditCard } from "lucide-react"
import { SealBadge } from "@/components/ui/seal-badge"

import { RunnerAvailableList } from "@/components/runner/RunnerAvailableList"
import { RunnerActiveOrderView } from "@/components/runner/RunnerActiveOrderView"

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
    const [actionLocked, setActionLocked] = useState(false)

    const getErrorMessage = (error: unknown, fallback: string) => {
        if (error instanceof Error && error.message) {
            return error.message
        }

        if (
            typeof error === "object" &&
            error !== null &&
            "message" in error &&
            typeof error.message === "string"
        ) {
            return error.message
        }

        return fallback
    }

    const fetchData = async (silent = false) => {
        if (!silent) setLoading(true)
        try {
            const [available, mine] = await Promise.all([
                ordersService.getAvailable(),
                ordersService.getAll() // backend filters by runnerId for myDeliveries
            ])
            setAvailableOrders(available)
            setMyDeliveries(mine)
        } catch (error) {
            toast.error("Error al cargar pedidos")
        } finally {
            if (!silent) setLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
        // Polling ligero para mantener estado fresco
        const interval = setInterval(() => fetchData(true), 15000)
        return () => clearInterval(interval)
    }, [])

    const handleAccept = async (orderId: string) => {
        if (actionLocked) return
        setActionLocked(true)
        try {
            await ordersService.accept(orderId)
            toast.success("¡Pedido aceptado! Modo Ruta Activa iniciado.")
            fetchData(true)
        } catch (error: unknown) {
            const message = getErrorMessage(
                error,
                "Error al aceptar pedido",
            )
            if (
                typeof error === "object" &&
                error !== null &&
                "response" in error &&
                typeof error.response === "object" &&
                error.response !== null &&
                "status" in error.response &&
                (error.response.status === 409 || error.response.status === 400)
            ) {
                toast.error("El pedido ya no está disponible o tu estado actual no permite aceptar más envíos.")
            } else {
                toast.error(message)
            }
            fetchData(true)
        } finally {
            setActionLocked(false)
        }
    }

    const handleInTransit = async (orderId: string) => {
        if (actionLocked) return
        setActionLocked(true)
        try {
            await ordersService.markInTransit(orderId)
            toast.success("¡Bolsas recogidas! Modo Entrega Final activado.")
            fetchData(true)
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, "Error al iniciar entrega"))
            fetchData(true)
        } finally {
            setActionLocked(false)
        }
    }

    const handleComplete = async (orderId: string) => {
        if (actionLocked) return
        setActionLocked(true)
        try {
            await ordersService.complete(orderId)
            toast.success("¡Misión cumplida! Entrega completada exitosamente.")
            fetchData(true)
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, "Error al completar pedido"))
            fetchData(true)
        } finally {
            setActionLocked(false)
        }
    }

    // Clasificación de Estados
    const activeOrder = myDeliveries.find(o => o.status === "ASSIGNED" || o.status === "IN_TRANSIT")
    const historicOrders = myDeliveries.filter(o => o.status === "DELIVERED" || o.status === "CANCELLED")

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
            <div className="bg-primary/5 border-b border-border/60 py-8 relative overflow-hidden">
                <div className="container relative z-10 px-4 md:px-6 max-w-7xl">
                    <SealBadge className="mb-4 shadow-none bg-background border-primary/20">Logística Local</SealBadge>
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <h1 className="font-display text-3xl font-extrabold text-foreground tracking-tight sm:text-4xl">
                            Panel de Repartidor
                        </h1>
                        <Button asChild variant="outline">
                            <Link href="/runner/finance">
                                <CreditCard className="mr-2 h-4 w-4" />
                                Cobros y estado
                            </Link>
                        </Button>
                    </div>
                </div>
            </div>

            <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

                {/* MODO FOCO: Si hay un pedido activo, Ocultamos Disponibles/Historial y mostramos solo el Activo */}
                {activeOrder ? (
                    <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <RunnerActiveOrderView
                            order={activeOrder}
                            onInTransit={handleInTransit}
                            onComplete={handleComplete}
                            disabled={actionLocked}
                        />
                    </section>
                ) : (
                    <div className="grid gap-10 lg:grid-cols-2">

                        {/* SECCIÓN DISPONIBLES */}
                        <section>
                            <div className="mb-6 flex items-center gap-2 border-b border-border/50 pb-4">
                                <Clock className="h-5 w-5 text-muted-foreground" />
                                <h2 className="font-display text-2xl font-bold">En el Barrio ({availableOrders.length})</h2>
                            </div>
                            <RunnerAvailableList
                                orders={availableOrders}
                                onAccept={handleAccept}
                                isActionDisabled={actionLocked}
                            />
                        </section>

                        {/* SECCIÓN HISTÓRICO */}
                        <section>
                            <div className="mb-6 flex items-center gap-2 border-b border-border/50 pb-4">
                                <History className="h-5 w-5 text-muted-foreground" />
                                <h2 className="font-display text-2xl font-bold">Tu Histórico ({historicOrders.length})</h2>
                            </div>

                            <div className="space-y-4">
                                {historicOrders.length === 0 ? (
                                    <div className="rounded-2xl border-2 border-dashed border-border/60 bg-muted/20 py-12 text-center">
                                        <p className="text-muted-foreground font-medium">Aún no has completado envíos.</p>
                                    </div>
                                ) : (
                                    historicOrders.map(order => (
                                        <div key={order.id} className="rounded-xl border border-border/50 bg-card p-4 shadow-sm opacity-90">
                                            <div className="flex items-center justify-between gap-4">
                                            <div>
                                                <p className="font-mono text-xs font-bold text-muted-foreground mb-1">#{order.id.slice(0, 8).toUpperCase()}</p>
                                                <p className="text-sm font-medium text-foreground">
                                                    {order.status === 'CANCELLED' ? (
                                                        <span className="flex items-center gap-1 text-red-600"><AlertTriangle className="h-3 w-3" /> Cancelado</span>
                                                    ) : (
                                                        "Completado"
                                                    )}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-bold text-muted-foreground">{order.deliveryFee.toFixed(2)} €</p>
                                                <p className="text-xs text-muted-foreground mt-0.5">{order.createdAt?.split('T')[0] || ''}</p>
                                            </div>
                                            </div>
                                            <div className="mt-3 flex justify-end">
                                                <Button asChild size="sm" variant="outline">
                                                    <Link href={`/runner/orders/${order.id}`}>
                                                        Ver detalle
                                                    </Link>
                                                </Button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </section>

                    </div>
                )}
            </div>
        </>
    )
}
