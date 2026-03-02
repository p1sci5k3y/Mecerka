"use client"

import { useEffect, useState, useMemo } from "react"
import { Loader2, DollarSign, Package, Clock, Inbox, PlayCircle, CheckCircle } from "lucide-react"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { ProtectedRoute } from "@/components/protected-route"
import { useAuth } from "@/contexts/auth-context"
import { ordersService } from "@/lib/services/orders-service"
import type { Order } from "@/lib/types"
import { OrderKanbanColumn } from "@/components/provider/OrderKanbanColumn"
import { useNow } from "@/hooks/use-now"
import { toast } from "sonner" // Asumiendo uso de sonner para toasts no intrusivos

export default function ProviderSalesPage() {
  return (
    <ProtectedRoute allowedRoles={["PROVIDER"]}>
      <ProviderKanbanContent />
    </ProtectedRoute>
  )
}

function ProviderKanbanContent() {
  const { user } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const now = useNow(30000) // Se actualiza cada 30 segundos
  // TODO: Conectar WebSocket inmersivo real en lugar o además de polling
  // const { socket } = useSocket()

  // Refetch orders silently
  const fetchOrders = async (silent = false) => {
    try {
      if (!silent) setLoading(true)
      const data = await ordersService.getAll()
      setOrders(data)
    } catch (e) {
      console.error("Failed to load provider orders", e)
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    fetchOrders()

    // Configurar polling silencioso o WebSockets aquí
    const interval = setInterval(() => fetchOrders(true), 15000)
    return () => clearInterval(interval)
  }, [])

  // Manejador de estado 100% dependiente de API y 409
  const handleStatusChange = async (providerOrderId: string, currentStatus: string, nextStatus: string) => {
    try {
      await ordersService.updateProviderOrderStatus(providerOrderId, nextStatus)
      // Refetch silencioso
      toast.success("Pedido actualizado correctamente")
      fetchOrders(true)
    } catch (err: any) {
      if (err.response?.status === 409) {
        toast.error("El estado del pedido cambió hace unos segundos. Reiniciando vista...")
      } else {
        toast.error("Error al actualizar el pedido.")
      }
      fetchOrders(true) // Forzar sincro fallida
    }
  }

  const handleReject = async (providerOrderId: string) => {
    try {
      await ordersService.updateProviderOrderStatus(providerOrderId, "REJECTED_BY_STORE")
      toast("Has rechazado el pedido. Se retirará de tu vista.", {
        description: "El sistema buscará alternativas si es posible."
      })
      fetchOrders(true)
    } catch (err: any) {
      toast.error("Error al rechazar. Verificando estado...")
      fetchOrders(true)
    }
  }

  // Cálculos de Hero Header puramente en memoria
  const heroStats = useMemo(() => {
    if (!user) return { today: 0, revenue: 0, prep: 0 }

    let totalToday = 0
    let revToday = 0
    let prepToday = 0

    const todayStr = new Date().toISOString().split('T')[0]

    orders.forEach(o => {
      const po = o.providerOrders?.find(p => p.providerId === String(user.userId))
      if (!po) return

      // Es de hoy?
      const isToday = po.createdAt?.startsWith(todayStr) || o.createdAt.startsWith(todayStr)

      if (isToday && po.status !== 'REJECTED_BY_STORE' && po.status !== 'CANCELLED') {
        totalToday++
        revToday += po.subtotal
      }
      if (po.status === 'PREPARING' || po.status === 'ACCEPTED') {
        prepToday++
      }
    })

    return { today: totalToday, revenue: revToday, prep: prepToday }
  }, [orders, user])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto w-full">
        {/* HERO STATS */}
        <div className="mb-8 flex flex-col gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold text-foreground">
              Panel Operativo
            </h1>
            <p className="text-muted-foreground mt-1">
              Hola, {user?.name}. Supervisa tus envíos en tiempo real.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Package className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pedidos Activos Hoy</p>
                <p className="font-display text-xl font-bold">{heroStats.today}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-500/10 text-yellow-500">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">En Preparación</p>
                <p className="font-display text-xl font-bold">{heroStats.prep}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10 text-green-500">
                <DollarSign className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Ingresos (Hoy)</p>
                <p className="font-display text-xl font-bold">{heroStats.revenue.toFixed(2)} €</p>
              </div>
            </div>
          </div>
        </div>

        {/* KANBAN BOARD */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <OrderKanbanColumn
            title="Nuevos"
            icon={<Inbox className="h-5 w-5" />}
            orders={orders}
            providerId={user?.userId ? String(user.userId) : "unknown"}
            validStatuses={["PENDING"]}
            now={now}
            onStatusChange={handleStatusChange}
            onReject={handleReject}
          />
          <OrderKanbanColumn
            title="En Preparación"
            icon={<PlayCircle className="h-5 w-5" />}
            orders={orders}
            providerId={user?.userId ? String(user.userId) : "unknown"}
            validStatuses={["ACCEPTED", "PREPARING"]}
            now={now}
            onStatusChange={handleStatusChange}
            onReject={handleReject}
          />
          <OrderKanbanColumn
            title="Listos"
            icon={<CheckCircle className="h-5 w-5" />}
            orders={orders}
            providerId={user?.userId ? String(user.userId) : "unknown"}
            validStatuses={["READY_FOR_PICKUP"]}
            now={now}
            onStatusChange={handleStatusChange}
            onReject={handleReject}
          />
        </div>
      </main>
      <Footer />
    </div>
  )
}
