"use client"

import { useEffect, useState } from "react"
import {
  Users,
  ShoppingBag,
  DollarSign,
  Package,
} from "lucide-react"
import { adminService } from "@/lib/services/admin-service"
import { AdminMetrics } from "@/lib/types"

export default function AdminDashboard() {
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
    </div>
  )
}
