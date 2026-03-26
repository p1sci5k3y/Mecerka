"use client"

import { useEffect, useMemo, useState } from "react"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { ProtectedRoute } from "@/components/protected-route"
import { Button } from "@/components/ui/button"
import { Link } from "@/lib/navigation"
import { ordersService } from "@/lib/services/orders-service"
import { getPublicRuntimeConfig } from "@/lib/runtime-config"
import type { Order } from "@/lib/types"
import {
  CreditCard,
  Loader2,
  ShoppingBag,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react"

function orderNeedsPayment(order: Order) {
  const providerNeedsPayment =
    order.providerOrders?.some(
      (providerOrder) =>
        providerOrder.paymentStatus !== "PAID" &&
        providerOrder.status !== "CANCELLED" &&
        providerOrder.status !== "REJECTED_BY_STORE",
    ) ?? false

  const runnerNeedsPayment =
    Boolean(order.deliveryOrder) &&
    order.deliveryOrder?.paymentStatus !== "PAID" &&
    order.status !== "CANCELLED"

  return providerNeedsPayment || runnerNeedsPayment
}

export default function ProfilePaymentsPage() {
  return (
    <ProtectedRoute allowedRoles={["CLIENT"]}>
      <ProfilePaymentsContent />
    </ProtectedRoute>
  )
}

function ProfilePaymentsContent() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [stripePublishableKey, setStripePublishableKey] = useState<string | null>(null)

  useEffect(() => {
    async function loadData() {
      try {
        const [ordersData, runtimeConfig] = await Promise.all([
          ordersService.getAll(),
          getPublicRuntimeConfig(),
        ])
        setOrders(ordersData)
        setStripePublishableKey(runtimeConfig.stripePublishableKey ?? null)
      } catch (error) {
        console.error("Error loading payment methods view:", error)
      } finally {
        setLoading(false)
      }
    }

    void loadData()
  }, [])

  const payableOrders = useMemo(
    () => orders.filter((order) => orderNeedsPayment(order)),
    [orders],
  )

  const stripeMode = !stripePublishableKey
    ? "DISABLED"
    : stripePublishableKey.includes("dummy")
      ? "DEMO"
      : "LIVE"

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
        <div className="mx-auto flex max-w-6xl flex-col gap-8">
          <div className="flex flex-col gap-3">
            <h1 className="font-display text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
              Pagos y tarjetas
            </h1>
            <p className="max-w-3xl text-lg text-muted-foreground">
              Mecerka no guarda todavía tarjetas del cliente en perfil. El pago se introduce dentro de cada pedido y cada sesión Stripe vive asociada a ese pedido concreto.
            </p>
          </div>

          <section className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="rounded-full bg-primary/10 p-3 text-primary">
                <CreditCard className="h-5 w-5" />
              </div>
              <div className="space-y-3">
                <h2 className="text-xl font-bold text-foreground">
                  Estado actual del modelo de pago
                </h2>
                <p className="text-sm text-muted-foreground">
                  Hoy el cliente no tiene una cartera persistente ni “tarjetas guardadas”. Cuando un pedido necesita cobro, entras en su pantalla de pagos y ahí se abre la sesión Stripe de cada comercio o del reparto.
                </p>
                {stripeMode === "LIVE" ? (
                  <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                    <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
                    <p>
                      Stripe está configurado. La tarjeta se introduce en el flujo de pago del pedido, no en esta pantalla.
                    </p>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
                    <p>
                      Este entorno está en modo demo o sin clave pública real. Aquí no hay tarjetas reales configurables y el pago se simula o se degrada según el entorno.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-foreground">
                  Pedidos con pago pendiente
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Entra al pedido para completar los pagos por comercio o del reparto cuando proceda.
                </p>
              </div>
              <Button asChild variant="outline">
                <Link href="/orders">Ver todos mis pedidos</Link>
              </Button>
            </div>

            {payableOrders.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-dashed border-border/70 bg-background/70 px-6 py-14 text-center">
                <ShoppingBag className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <p className="mt-4 font-semibold text-foreground">
                  No tienes pedidos con pago pendiente ahora mismo.
                </p>
              </div>
            ) : (
              <div className="mt-6 grid gap-4">
                {payableOrders.map((order) => (
                  <article
                    key={order.id}
                    className="rounded-2xl border border-border/60 bg-background/70 p-5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                          Pedido #{order.id.slice(0, 8).toUpperCase()}
                        </p>
                        <h3 className="mt-2 text-lg font-bold text-foreground">
                          {order.items[0]?.product?.name || "Pedido local"}
                          {order.items.length > 1
                            ? ` y ${order.items.length - 1} más`
                            : ""}
                        </h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Estado: {order.status}
                        </p>
                      </div>

                      <Button asChild>
                        <Link href={`/orders/${order.id}/payments`}>
                          Gestionar pago
                        </Link>
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
      <Footer />
    </div>
  )
}
