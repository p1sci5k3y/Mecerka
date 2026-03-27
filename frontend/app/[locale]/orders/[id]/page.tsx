"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { usePathname, useRouter, Link } from "@/lib/navigation"
import {
  ArrowLeft,
  ArrowRight,
  CreditCard,
  LifeBuoy,
  Loader2,
  MapPinned,
  PackageCheck,
  ReceiptText,
  Store,
  Truck,
} from "lucide-react"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { ProtectedRoute } from "@/components/protected-route"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/auth-context"
import { ordersService } from "@/lib/services/orders-service"
import type { Order, OrderItem, ProviderOrder } from "@/lib/types"

function formatCurrency(amount: number) {
  return amount.toLocaleString("es-ES", {
    style: "currency",
    currency: "EUR",
  })
}

function orderStatusLabel(status: Order["status"]) {
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

function providerStatusLabel(status: ProviderOrder["status"]) {
  switch (status) {
    case "PENDING":
      return "Pendiente"
    case "ACCEPTED":
      return "Aceptado"
    case "PREPARING":
      return "Preparando"
    case "READY_FOR_PICKUP":
      return "Listo para recogida"
    case "PICKED_UP":
      return "Recogido"
    case "DELIVERED":
      return "Entregado"
    case "CANCELLED":
      return "Cancelado"
    case "REJECTED_BY_STORE":
      return "Rechazado por comercio"
    default:
      return status
  }
}

function paymentStatusLabel(status?: string | null) {
  switch (status) {
    case "PAID":
      return "Pagado"
    case "PAYMENT_READY":
      return "Sesión lista"
    case "PAYMENT_PENDING":
      return "Pago pendiente"
    case "FAILED":
      return "Fallido"
    case "PENDING":
      return "Pendiente"
    default:
      return status ?? "Pendiente"
  }
}

function itemSubtotal(item: OrderItem) {
  return item.unitPrice * item.quantity
}

function buildPrimaryActions(order: Order) {
  const hasPendingProviderPayments = order.providerOrders?.some(
    (providerOrder) => providerOrder.paymentStatus !== "PAID",
  )
  const hasPendingRunnerPayment =
    order.deliveryOrder && order.deliveryOrder.paymentStatus !== "PAID"
  const paymentPending = hasPendingProviderPayments || hasPendingRunnerPayment
  const deliveryActive =
    order.status === "ASSIGNED" || order.status === "IN_TRANSIT"

  return {
    paymentPending,
    deliveryActive,
  }
}

export default function OrderDetailPage() {
  return (
    <ProtectedRoute allowedRoles={["CLIENT"]}>
      <OrderDetailContent />
    </ProtectedRoute>
  )
}

function OrderDetailContent() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const pathname = usePathname()
  const { user, isAuthenticated, isLoading } = useAuth()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const orderId = typeof params.id === "string" ? params.id : ""

  useEffect(() => {
    if (isLoading) {
      return
    }

    if (!isAuthenticated) {
      router.replace(`/login?returnTo=${encodeURIComponent(pathname)}`)
      return
    }

    if (user && !user.roles.includes("CLIENT")) {
      router.replace("/dashboard")
    }
  }, [isAuthenticated, isLoading, pathname, router, user])

  useEffect(() => {
    async function loadOrder() {
      if (!isAuthenticated || !orderId) {
        return
      }

      try {
        const data = await ordersService.getOne(orderId)
        setOrder(data)
        setError(null)
      } catch (loadError) {
        console.error("Error loading order detail:", loadError)
        setError("No pudimos cargar este pedido.")
      } finally {
        setLoading(false)
      }
    }

    void loadOrder()
  }, [isAuthenticated, orderId])

  const totalItems = useMemo(
    () => order?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0,
    [order],
  )
  const providerCount = order?.providerOrders?.length ?? 0
  const actions = order ? buildPrimaryActions(order) : null

  if (isLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!isAuthenticated || !user?.roles.includes("CLIENT")) {
    return null
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="flex-1 bg-[#FBF6EE] px-6 py-10 dark:bg-[#140D0B] md:px-10 lg:px-16">
        <div className="mx-auto flex max-w-6xl flex-col gap-8">
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => router.push("/orders")}
              className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver a mis pedidos
            </button>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                  Pedido #{orderId.slice(0, 8).toUpperCase()}
                </p>
                <h1 className="font-display text-4xl font-extrabold tracking-tight text-foreground">
                  Ficha del pedido
                </h1>
                <p className="mt-2 max-w-3xl text-lg text-muted-foreground">
                  Este es el punto central del pedido: desde aquí saltas a pagos,
                  seguimiento y soporte sin perder el contexto de comercios,
                  reparto e importes.
                </p>
              </div>
              {order ? (
                <div className="rounded-2xl border border-primary/20 bg-primary/5 px-5 py-4 text-sm text-primary">
                  <div className="font-semibold">Estado actual</div>
                  <div className="mt-1 text-lg font-bold text-foreground">
                    {orderStatusLabel(order.status)}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {error ? (
            <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-5 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {order ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Total pedido
                  </p>
                  <p className="mt-3 text-3xl font-extrabold text-foreground">
                    {formatCurrency(order.total)}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Artículos
                  </p>
                  <p className="mt-3 text-3xl font-extrabold text-foreground">
                    {totalItems}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Comercios
                  </p>
                  <p className="mt-3 text-3xl font-extrabold text-foreground">
                    {providerCount}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Gastos de reparto
                  </p>
                  <p className="mt-3 text-3xl font-extrabold text-foreground">
                    {formatCurrency(order.deliveryFee)}
                  </p>
                </div>
              </div>

              <section className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-foreground">
                      Acciones rápidas
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Entra al siguiente tramo operativo del pedido según lo que tengas pendiente.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button asChild>
                      <Link href={`/orders/${order.id}/payments`}>
                        <CreditCard className="mr-2 h-4 w-4" />
                        {actions?.paymentPending ? "Resolver pagos" : "Ver pagos"}
                      </Link>
                    </Button>
                    <Button asChild variant="outline">
                      <Link href={`/orders/${order.id}/track`}>
                        <Truck className="mr-2 h-4 w-4" />
                        {actions?.deliveryActive ? "Seguir pedido" : "Abrir seguimiento"}
                      </Link>
                    </Button>
                    <Button asChild variant="outline">
                      <Link href="/profile/support">
                        <LifeBuoy className="mr-2 h-4 w-4" />
                        Mi soporte
                      </Link>
                    </Button>
                    <Button asChild variant="outline">
                      <Link href="/orders">
                        Volver al centro de pedidos
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </section>

              <div className="grid gap-8 lg:grid-cols-[1.15fr,0.85fr]">
                <section className="space-y-6">
                  <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
                    <div className="flex items-center gap-2">
                      <ReceiptText className="h-5 w-5 text-primary" />
                      <h2 className="text-xl font-bold text-foreground">
                        Resumen económico
                      </h2>
                    </div>
                    <div className="mt-5 space-y-3 text-sm">
                      {order.providerOrders?.map((providerOrder) => (
                        <div
                          key={providerOrder.id}
                          className="flex items-center justify-between gap-4 rounded-xl border border-border/50 bg-background/60 px-4 py-3"
                        >
                          <div>
                            <p className="font-semibold text-foreground">
                              {providerOrder.providerName || `Comercio ${providerOrder.providerId.slice(0, 6)}`}
                            </p>
                            <p className="text-muted-foreground">
                              {providerStatusLabel(providerOrder.status)} · {paymentStatusLabel(providerOrder.paymentStatus)}
                            </p>
                          </div>
                          <div className="text-right">
                            {providerOrder.discountAmount > 0 ? (
                              <p className="text-xs text-muted-foreground line-through">
                                {formatCurrency(providerOrder.originalSubtotal)}
                              </p>
                            ) : null}
                            <p className="font-semibold text-foreground">
                              {formatCurrency(providerOrder.subtotal)}
                            </p>
                          </div>
                        </div>
                      ))}
                      <div className="flex items-center justify-between border-t pt-3 font-semibold text-foreground">
                        <span>Reparto</span>
                        <span>{formatCurrency(order.deliveryFee)}</span>
                      </div>
                      <div className="flex items-center justify-between border-t pt-3 text-lg font-extrabold text-foreground">
                        <span>Total</span>
                        <span>{formatCurrency(order.total)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
                    <div className="flex items-center gap-2">
                      <PackageCheck className="h-5 w-5 text-primary" />
                      <h2 className="text-xl font-bold text-foreground">
                        Artículos del pedido
                      </h2>
                    </div>
                    <div className="mt-5 space-y-4">
                      {order.items.map((item) => (
                        <article
                          key={item.id}
                          className="flex flex-col gap-3 rounded-xl border border-border/50 bg-background/60 p-4 sm:flex-row sm:items-start sm:justify-between"
                        >
                          <div>
                            <p className="font-semibold text-foreground">
                              {item.product?.name || `Producto ${item.productId}`}
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {item.product?.provider?.name || "Comercio local"} · {item.product?.city || "Ciudad no disponible"}
                            </p>
                            <p className="mt-2 text-sm text-muted-foreground">
                              {item.quantity} unidad(es) · {formatCurrency(item.unitPrice)} por unidad
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-foreground">
                              {formatCurrency(itemSubtotal(item))}
                            </p>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                </section>

                <aside className="space-y-6">
                  <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
                    <div className="flex items-center gap-2">
                      <MapPinned className="h-5 w-5 text-primary" />
                      <h2 className="text-xl font-bold text-foreground">
                        Entrega
                      </h2>
                    </div>
                    <div className="mt-5 space-y-3 text-sm">
                      <p className="text-muted-foreground">
                        Dirección:{" "}
                        <span className="font-semibold text-foreground">
                          {order.deliveryAddress || "Pendiente"}
                        </span>
                      </p>
                      <p className="text-muted-foreground">
                        Código postal:{" "}
                        <span className="font-semibold text-foreground">
                          {order.postalCode || "Sin CP"}
                        </span>
                      </p>
                      <p className="text-muted-foreground">
                        Estado de reparto:{" "}
                        <span className="font-semibold text-foreground">
                          {order.deliveryOrder?.status || "Sin reparto asignado"}
                        </span>
                      </p>
                      <p className="text-muted-foreground">
                        Pago de reparto:{" "}
                        <span className="font-semibold text-foreground">
                          {paymentStatusLabel(order.deliveryOrder?.paymentStatus)}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
                    <div className="flex items-center gap-2">
                      <Store className="h-5 w-5 text-primary" />
                      <h2 className="text-xl font-bold text-foreground">
                        Comercios implicados
                      </h2>
                    </div>
                    <div className="mt-5 space-y-3">
                      {order.providerOrders?.map((providerOrder) => (
                        <div
                          key={providerOrder.id}
                          className="rounded-xl border border-border/50 bg-background/60 p-4 text-sm"
                        >
                          <p className="font-semibold text-foreground">
                            {providerOrder.providerName || `Comercio ${providerOrder.providerId.slice(0, 6)}`}
                          </p>
                          <p className="mt-1 text-muted-foreground">
                            {providerOrder.items.length} línea(s) · {providerStatusLabel(providerOrder.status)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </aside>
              </div>
            </>
          ) : null}
        </div>
      </main>
      <Footer />
    </div>
  )
}
