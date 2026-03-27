"use client"

import { useEffect, useState } from "react"
import { Link } from "@/lib/navigation"
import {
  Users,
  ShoppingBag,
  DollarSign,
  HandCoins,
  Siren,
  Settings2,
} from "lucide-react"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { ProtectedRoute } from "@/components/protected-route"
import { adminService } from "@/lib/services/admin-service"
import { AdminMetrics } from "@/lib/types"

export default function AdminDashboard() {
  return (
    <ProtectedRoute allowedRoles={["ADMIN"]}>
      <div className="flex min-h-screen flex-col bg-background selection:bg-primary/20">
        <Navbar />
        <main className="flex-1 px-6 py-8 md:px-10 lg:px-16">
          <div className="mx-auto max-w-7xl">
            <AdminDashboardContent />
          </div>
        </main>
        <Footer />
      </div>
    </ProtectedRoute>
  )
}

function AdminDashboardContent() {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    adminService.getMetrics()
      .then(setMetrics)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="p-8">Cargando métricas...</div>
  }

  if (!metrics) {
    return <div className="p-8 text-destructive">Error al cargar métricas</div>
  }

  const cards = [
    { label: "Usuarios totales", value: metrics.totalUsers, icon: Users },
    { label: "Proveedores", value: metrics.totalProviders, icon: Users },
    { label: "Pedidos totales", value: metrics.totalOrders, icon: ShoppingBag },
    {
      label: "Ingresos (GMV)",
      value: new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(metrics.totalRevenue),
      icon: DollarSign
    },
  ]

  const quickActions = [
    {
      label: "Gestionar usuarios",
      description: "Bloquea cuentas, revisa roles y controla accesos.",
      href: "/admin/users",
      icon: Users,
    },
    {
      label: "Revisar devoluciones",
      description: "Procesa solicitudes pendientes, aprobaciones y ejecuciones.",
      href: "/admin/refunds",
      icon: HandCoins,
    },
    {
      label: "Gestionar incidencias",
      description: "Revisa entregas problemáticas y decide si se resuelven o se rechazan.",
      href: "/admin/incidents",
      icon: Siren,
    },
    {
      label: "Editar maestros",
      description: "Mantén ciudades y categorías alineadas con la operación.",
      href: "/admin/masters?tab=cities",
      icon: Settings2,
    },
  ]

  return (
    <div>
      <h1 className="mb-8 font-display text-3xl font-bold">Dashboard</h1>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="flex items-center gap-4 rounded-xl border bg-card p-6 shadow-sm"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <card.icon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">{card.label}</p>
              <p className="font-display text-2xl font-bold">{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-xl border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold">Resumen de Actividad</h2>
        <p className="text-muted-foreground">
          Bienvenido al panel de administración. Selecciona una opción del menú lateral para gestionar la plataforma.
        </p>
      </div>

      <div className="mt-8">
        <h2 className="mb-4 text-lg font-semibold">Operaciones rápidas</h2>
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="rounded-xl border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <action.icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold">{action.label}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{action.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
