"use client"

import { useEffect, useState } from "react"
import {
  BarChart3,
  DollarSign,
  Package,
  Loader2,
  TrendingUp,
  Star,
  Award,
} from "lucide-react"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { ProtectedRoute } from "@/components/protected-route"
import { useAuth } from "@/contexts/auth-context"
import { ordersService } from "@/lib/services/orders-service"
import { Badge } from "@/components/ui/badge"
import type { Order, ProviderStats, SalesChartData, TopProduct } from "@/lib/types"

// Recharts components
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts'

export default function ProviderSalesPage() {
  return (
    <ProtectedRoute allowedRoles={["PROVIDER"]}>
      <SalesContent />
    </ProtectedRoute>
  )
}

function SalesContent() {
  const { user } = useAuth()
  const [stats, setStats] = useState<ProviderStats | null>(null)
  const [chartData, setChartData] = useState<SalesChartData[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsData, chartRes, topRes] = await Promise.all([
          ordersService.getProviderStats(),
          ordersService.getSalesChart(),
          ordersService.getTopProducts()
        ])

        // Stats might come inside an object depending on how api.get wraps it? 
        // In orders-service we use api.get<ProviderStats>, which returns the object directly usually.
        // Let's assume typescript types are correct.
        setStats(statsData)
        setChartData(chartRes)
        setTopProducts(topRes)
      } catch (e) {
        console.error("Failed to load sales data", e)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const starProduct = topProducts.length > 0 ? topProducts[0] : null

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
          <div className="mb-8">
            <h1 className="font-display text-3xl font-bold text-foreground">
              Panel de ventas
            </h1>
            <p className="mt-1 text-muted-foreground">
              Hola {user?.name}, aquí tienes el rendimiento de tu negocio
            </p>
          </div>

          {/* Key Metrics */}
          <div className="mb-8 grid gap-4 sm:grid-cols-4">
            {[
              {
                label: "Ingresos totales",
                value: `${stats?.totalRevenue.toFixed(2)} €` || "0.00 €",
                icon: DollarSign,
              },
              {
                label: "Pedidos totales",
                value: stats?.totalOrders || 0,
                icon: BarChart3,
              },
              {
                label: "Productos vendidos",
                value: stats?.itemsSold || 0,
                icon: Package,
              },
              {
                label: "Ticket medio",
                value: `${stats?.averageTicket.toFixed(2)} €` || "0.00 €",
                icon: TrendingUp,
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="flex items-center gap-4 rounded-xl border border-border bg-card p-5"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <stat.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="font-display text-xl font-bold text-card-foreground">
                    {stat.value}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Gráfico y Producto Estrella */}
          <div className="mb-8 grid gap-8 lg:grid-cols-3">
            {/* Chart */}
            <div className="rounded-xl border border-border bg-card p-6 lg:col-span-2">
              <h3 className="mb-6 font-display text-lg font-semibold">Evolución de ventas (30 días)</h3>
              <div className="h-[300px] w-full">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis
                        dataKey="date"
                        fontSize={12}
                        tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })}
                      />
                      <YAxis fontSize={12} tickFormatter={(val) => `${val}€`} />
                      <Tooltip
                        formatter={(val: number) => [`${val.toFixed(2)} €`, "Ventas"]}
                        labelFormatter={(label) => new Date(label).toLocaleDateString()}
                      />
                      <Line
                        type="monotone"
                        dataKey="amount"
                        stroke="#000000" // Use theme color properly in future
                        strokeWidth={2}
                        activeDot={{ r: 8 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    No hay datos suficientes
                  </div>
                )}
              </div>
            </div>

            {/* Star Product */}
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-display text-lg font-semibold">Producto Estrella</h3>
                <Award className="h-5 w-5 text-yellow-500" />
              </div>

              {starProduct ? (
                <div className="flex flex-col items-center justify-center pt-4 text-center">
                  <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-yellow-100 text-yellow-600">
                    <Star className="h-10 w-10 fill-current" />
                  </div>
                  <h4 className="text-xl font-bold">{starProduct.name}</h4>
                  <p className="text-sm text-muted-foreground">{starProduct.quantity} unidades vendidas</p>
                  <div className="mt-4 rounded-lg bg-secondary/50 px-4 py-2">
                    <p className="text-sm font-medium">Ingresos generados</p>
                    <p className="text-2xl font-bold text-primary">{starProduct.revenue.toFixed(2)} €</p>
                  </div>
                </div>
              ) : (
                <div className="flex h-40 items-center justify-center text-muted-foreground text-sm">
                  Calculando producto estrella...
                </div>
              )}

              <div className="mt-6 border-t border-border pt-4">
                <h5 className="mb-3 text-sm font-medium">Top Productos</h5>
                <div className="space-y-3">
                  {topProducts.slice(1, 4).map((prod, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm">
                      <span className="truncate text-muted-foreground">{prod.name}</span>
                      <span className="font-medium">{prod.revenue.toFixed(0)}€</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

        </div>
      </main>
      <Footer />
    </div>
  )
}
