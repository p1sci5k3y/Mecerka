"use client"

import { useEffect, useMemo, useState } from "react"
import { Link } from "@/lib/navigation"
import { Clock3, ShieldCheck, UserCog } from "lucide-react"
import { adminService } from "@/lib/services/admin-service"
import { BackendAdminUser } from "@/lib/types"

function governanceOriginLabel(user: BackendAdminUser) {
  if (user.lastRoleSource === "ADMIN") return "Concedido por admin"
  if (user.lastRoleSource === "SELF_SERVICE") return "Originado por autoservicio"
  return "Sin origen registrado"
}

export default function AdminRoleRequestsPage() {
  const [users, setUsers] = useState<BackendAdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<"ALL" | "PENDING" | "SELF_SERVICE" | "ADMIN">("ALL")

  useEffect(() => {
    adminService.getUsers()
      .then(setUsers)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const governanceUsers = useMemo(() => {
    const relevant = users.filter((user) => user.requestedRole || user.lastRoleSource)
    return relevant.filter((user) => {
      if (filter === "PENDING") return user.roleStatus === "PENDING"
      if (filter === "SELF_SERVICE") return user.lastRoleSource === "SELF_SERVICE"
      if (filter === "ADMIN") return user.lastRoleSource === "ADMIN"
      return true
    })
  }, [filter, users])

  const pendingCount = users.filter((user) => user.roleStatus === "PENDING").length
  const selfServiceCount = users.filter((user) => user.lastRoleSource === "SELF_SERVICE").length
  const adminGrantedCount = users.filter((user) => user.lastRoleSource === "ADMIN").length

  if (loading) {
    return <div className="p-8">Cargando solicitudes y concesiones...</div>
  }

  return (
    <div>
      <div className="mb-8 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Solicitudes y concesiones</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Vista operativa del último estado de gobierno por usuario. Aquí ves solicitudes abiertas y
            concesiones recientes por autoservicio o por administración. No es un historial completo.
          </p>
        </div>
        <Link
          href="/admin/users"
          className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium"
        >
          Abrir gestión completa de usuarios
        </Link>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Solicitudes pendientes</p>
          <p className="mt-2 text-3xl font-semibold">{pendingCount}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Concedidas por autoservicio</p>
          <p className="mt-2 text-3xl font-semibold">{selfServiceCount}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Concedidas por admin</p>
          <p className="mt-2 text-3xl font-semibold">{adminGrantedCount}</p>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <button type="button" className={`rounded-full border px-4 py-2 text-sm ${filter === "ALL" ? "bg-primary/10 text-primary" : ""}`} onClick={() => setFilter("ALL")}>
          Todas
        </button>
        <button type="button" className={`rounded-full border px-4 py-2 text-sm ${filter === "PENDING" ? "bg-primary/10 text-primary" : ""}`} onClick={() => setFilter("PENDING")}>
          Pendientes
        </button>
        <button type="button" className={`rounded-full border px-4 py-2 text-sm ${filter === "SELF_SERVICE" ? "bg-primary/10 text-primary" : ""}`} onClick={() => setFilter("SELF_SERVICE")}>
          Autoservicio
        </button>
        <button type="button" className={`rounded-full border px-4 py-2 text-sm ${filter === "ADMIN" ? "bg-primary/10 text-primary" : ""}`} onClick={() => setFilter("ADMIN")}>
          Admin
        </button>
      </div>

      {governanceUsers.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-sm text-muted-foreground">
          No hay elementos en esta cola con el estado seleccionado.
        </div>
      ) : (
        <div className="grid gap-4">
          {governanceUsers.map((user) => (
            <div key={user.id} className="rounded-xl border bg-card p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold">{user.name}</h2>
                    <span className="text-sm text-muted-foreground">{user.email}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1 rounded-full border px-3 py-1">
                      <UserCog className="h-4 w-4" />
                      Roles: {user.roles.join(", ")}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border px-3 py-1">
                      {user.roleStatus === "PENDING" ? <Clock3 className="h-4 w-4 text-amber-600" /> : <ShieldCheck className="h-4 w-4 text-emerald-600" />}
                      {user.requestedRole ? `${user.requestedRole} · ${user.roleStatus ?? "sin estado"}` : "Sin solicitud abierta"}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{governanceOriginLabel(user)}</p>
                </div>
                <Link
                  href={`/admin/users/${user.id}`}
                  className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium"
                >
                  Abrir detalle
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
