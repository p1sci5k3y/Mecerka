"use client"

import { useEffect, useMemo, useState } from "react"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { ProtectedRoute } from "@/components/protected-route"
import { Button } from "@/components/ui/button"
import { Link } from "@/lib/navigation"
import { ordersService } from "@/lib/services/orders-service"
import { useAuth } from "@/contexts/auth-context"
import type { Order } from "@/lib/types"
import {
  ArrowRight,
  CreditCard,
  Loader2,
  PackageCheck,
  ShoppingBag,
  Truck,
} from "lucide-react"

function formatCurrency(amount: number) {
  return amount.toLocaleString("es-ES", {
    style: "currency",
    currency: "EUR",
  })
}

function statusLabel(status: Order["status"]) {
  switch (status) {
    case "PENDING":
      return "Pendiente"
    case "CONFIRMED":
      return "Confirmado"
    case "READY_FOR_ASSIGNMENT":
      return "Listo para asignación"
    case "ASSIGNED":
      return "Repartidor asignado"
    case "IN_TRANSIT":
      return "En reparto"
    case "DELIVERED":
      return "Entregado"
    case "CANCELLED":
      return "Cancelado"
    default:
      return status
  }
}

function isActiveOrder(order: Order) {
  return order.status !== "DELIVERED" && order.status !== "CANCELLED"
}

function orderImage(order: Order) {
  return (
    order.items[0]?.product?.imageUrl ||
    "https://images.unsplash.com/photo-1606760227091-3dd870d97f1d?q=80"
  )
}

export default function OrdersPage() {
  return (
    <ProtectedRoute allowedRoles={["CLIENT"]}>
      <OrdersContent />
    </ProtectedRoute>
  )
}

function OrdersContent() {
  const { user } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadOrders() {
      if (!user) {
        return
      }

      try {
        const data = await ordersService.getAll()
        setOrders(data)
      } catch (error) {
        console.error("Error loading orders hub:", error)
      } finally {
        setLoading(false)
      }
    }

    void loadOrders()
  }, [user])

  const activeOrders = useMemo(
    () => orders.filter((order) => isActiveOrder(order)),
    [orders],
  )
  const pastOrders = useMemo(
    () => orders.filter((order) => !isActiveOrder(order)),
    [orders],
  )
  const totalSpent = useMemo(
    () =>
      pastOrders.reduce((sum, order) => {
        const itemsTotal = order.items.reduce(
          (acc, item) => acc + Number(item.priceAtPurchase) * item.quantity,
          0,
        )
        return sum + itemsTotal
      }, 0),
    [pastOrders],
  )

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <Navbar />
        <main className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </main>
        <Footer />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background selection:bg-primary/20">
      <Navbar />
      <main className="flex-1 bg-[#FBF6EE] px-6 py-10 transition-colors dark:bg-[#140D0B] md:px-10 lg:px-16">
        <div className="mx-auto flex max-w-7xl flex-col gap-10">
          <div className="flex flex-col gap-3">
            <h1 className="font-display text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
              Mis pedidos
            </h1>
            <p className="max-w-3xl text-lg text-muted-foreground">
              Aquí no se pierde nada: revisa lo pendiente, entra al seguimiento y vuelve a los pagos separados cuando haga falta.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Pendientes
              </p>
              <p className="mt-3 font-display text-3xl font-bold text-foreground">
                {activeOrders.length}
              </p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Histórico
              </p>
              <p className="mt-3 font-display text-3xl font-bold text-foreground">
                {pastOrders.length}
              </p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Inversión local cerrada
              </p>
              <p className="mt-3 font-display text-3xl font-bold text-foreground">
                {formatCurrency(totalSpent)}
              </p>
            </div>
          </div>

          {orders.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 bg-card px-6 py-16 text-center shadow-sm">
              <ShoppingBag className="mx-auto h-14 w-14 text-muted-foreground/50" />
              <h2 className="mt-6 font-display text-2xl font-bold text-foreground">
                Aún no tienes pedidos
              </h2>
              <p className="mx-auto mt-3 max-w-md text-muted-foreground">
                Cuando completes tu primera compra, aparecerá aquí con acceso directo a pagos y seguimiento.
              </p>
              <Button asChild className="mt-6">
                <Link href="/products">Explorar catálogo</Link>
              </Button>
            </div>
          ) : null}

          {activeOrders.length > 0 ? (
            <section className="flex flex-col gap-5">
              <div className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-primary" />
                <h2 className="font-display text-2xl font-bold text-foreground">
                  Pedidos pendientes
                </h2>
              </div>

              <div className="grid gap-6">
                {activeOrders.map((order) => (
                  <article
                    key={order.id}
                    className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm"
                  >
                    <div className="grid gap-0 lg:grid-cols-[240px_1fr]">
                      <div
                        className="min-h-[220px] bg-cover bg-center"
                        style={{ backgroundImage: `url('${orderImage(order)}')` }}
                      />
                      <div className="flex flex-col gap-6 p-6">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                              Pedido #{order.id.slice(0, 8).toUpperCase()}
                            </p>
                            <h3 className="mt-2 text-2xl font-bold text-foreground">
                              {order.items[0]?.product?.name || "Pedido local"}
                              {order.items.length > 1
                                ? ` y ${order.items.length - 1} más`
                                : ""}
                            </h3>
                            <p className="mt-3 text-sm text-muted-foreground">
                              Estado actual:{" "}
                              <span className="font-semibold text-foreground">
                                {statusLabel(order.status)}
                              </span>
                            </p>
                            <p className="mt-2 text-sm text-muted-foreground">
                              Entrega en {order.deliveryAddress || "dirección pendiente"}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              Total estimado
                            </p>
                            <p className="mt-2 text-2xl font-extrabold text-foreground">
                              {formatCurrency(order.total)}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-3">
                          <Button asChild>
                            <Link href={`/orders/${order.id}/track`}>
                              Seguir pedido
                              <ArrowRight className="ml-2 h-4 w-4" />
                            </Link>
                          </Button>
                          <Button asChild variant="outline">
                            <Link href={`/orders/${order.id}/payments`}>
                              <CreditCard className="mr-2 h-4 w-4" />
                              Gestionar pagos
                            </Link>
                          </Button>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {pastOrders.length > 0 ? (
            <section className="flex flex-col gap-5">
              <div className="flex items-center gap-2">
                <PackageCheck className="h-5 w-5 text-primary" />
                <h2 className="font-display text-2xl font-bold text-foreground">
                  Histórico
                </h2>
              </div>

              <div className="grid gap-4">
                {pastOrders.map((order) => (
                  <article
                    key={order.id}
                    className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                          Pedido #{order.id.slice(0, 8).toUpperCase()}
                        </p>
                        <h3 className="mt-2 text-lg font-bold text-foreground">
                          {order.items[0]?.product?.name || "Pedido local"}
                          {order.items.length > 1
                            ? ` y ${order.items.length - 1} más`
                            : ""}
                        </h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {statusLabel(order.status)} ·{" "}
                          {new Date(order.createdAt).toLocaleDateString("es-ES")}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <Button asChild variant="outline">
                          <Link href={`/orders/${order.id}/payments`}>
                            <CreditCard className="mr-2 h-4 w-4" />
                            Ver pagos
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </main>
      <Footer />
    </div>
  )
}
