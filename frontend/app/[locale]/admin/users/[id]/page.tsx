"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { Link } from "@/lib/navigation"
import { adminService } from "@/lib/services/admin-service"
import type { AdminGovernanceAuditEntry, BackendAdminUserDetail, Role } from "@/lib/types"
import { useToast } from "@/components/ui/use-toast"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/contexts/auth-context"

function governanceSourceLabel(source: BackendAdminUserDetail["lastRoleSource"]) {
  if (source === "ADMIN") return "Concedido por admin"
  if (source === "SELF_SERVICE") return "Originado por autoservicio"
  return "Sin origen registrado"
}

function actionLabel(entry: AdminGovernanceAuditEntry) {
  switch (entry.action) {
    case "ROLE_REQUESTED":
      return `Solicitud ${entry.role ?? "sin rol"}`
    case "ROLE_GRANTED":
      return `Rol ${entry.role ?? "sin rol"} concedido`
    case "ROLE_REVOKED":
      return `Rol ${entry.role ?? "sin rol"} revocado`
    case "USER_ACTIVATED":
      return "Usuario activado"
    case "USER_BLOCKED":
      return "Usuario bloqueado"
    default:
      return entry.action
  }
}

function hasRole(user: BackendAdminUserDetail, role: Role) {
  return user.roles.includes(role)
}

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>()
  const userId = Array.isArray(params?.id) ? params.id[0] : params?.id
  const [user, setUser] = useState<BackendAdminUserDetail | null>(null)
  const [history, setHistory] = useState<AdminGovernanceAuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const { toast } = useToast()
  const { user: currentUser } = useAuth()

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false)
      setUser(null)
      setHistory([])
      setHistoryError(null)
      return
    }
    try {
      const detail = await adminService.getUser(userId)
      setUser(detail)
      setHistoryError(null)
    } catch (error) {
      console.error("Error cargando el usuario admin:", error)
      setUser(null)
      setHistory([])
      setHistoryError(null)
      toast({
        title: "Error",
        description: "No se pudo cargar el detalle del usuario",
        variant: "destructive",
      })
      setLoading(false)
      return
    }

    try {
      const entries = await adminService.getUserGovernanceHistory(userId)
      setHistory(Array.isArray(entries) ? entries : [])
      setHistoryError(null)
    } catch (error) {
      console.error("Error cargando historial de gobernanza:", error)
      setHistory([])
      setHistoryError("No se pudo cargar el historial de gobernanza.")
      toast({
        title: "Error",
        description: "No se pudo cargar el historial de gobernanza",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [toast, userId])

  useEffect(() => {
    load()
  }, [load])

  const handleRoleChange = async (role: Role, action: "grant" | "revoke") => {
    if (!user) return
    try {
      setActing(`${action}-${role}`)
      if (action === "grant") {
        await adminService.grantRole(user.id, role)
        toast({ title: `Rol ${role} concedido` })
      } else {
        await adminService.revokeRole(user.id, role)
        toast({ title: `Rol ${role} revocado` })
      }
      await load()
    } catch (error) {
      console.error(error)
      toast({
        title: "Error",
        description: `No se pudo ${action === "grant" ? "conceder" : "revocar"} el rol ${role}`,
        variant: "destructive",
      })
    } finally {
      setActing(null)
    }
  }

  const handleStatusChange = async () => {
    if (!user) return
    try {
      setActing(user.active ? "block" : "activate")
      if (user.active) {
        await adminService.blockUser(user.id)
        toast({ title: "Usuario bloqueado" })
      } else {
        await adminService.activateUser(user.id)
        toast({ title: "Usuario activado" })
      }
      await load()
    } catch (error) {
      console.error(error)
      toast({
        title: "Error",
        description: "No se pudo cambiar el estado del usuario",
        variant: "destructive",
      })
    } finally {
      setActing(null)
    }
  }

  const availableGrants = useMemo(() => {
    if (!user) return []
    return (["PROVIDER", "RUNNER", "ADMIN"] as Role[]).filter((role) => !hasRole(user, role))
  }, [user])

  const revocableRoles = useMemo(() => {
    if (!user) return []
    return user.roles.filter((role) => !(currentUser?.userId === user.id && role === "ADMIN"))
  }, [currentUser?.userId, user])

  if (loading) {
    return <div className="p-8">Cargando detalle del usuario...</div>
  }

  if (!user) {
    return <div className="p-8">No se encontró el usuario.</div>
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Backoffice de usuario</p>
          <h1 className="font-display text-3xl font-bold">{user.name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{user.email}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/users"
            className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium"
          >
            Volver a usuarios
          </Link>
          <Link
            href="/admin/role-requests"
            className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium"
          >
            Ver cola de gobierno
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Estado</p>
          <p className="mt-2 text-xl font-semibold">{user.active ? "Activo" : "Bloqueado"}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">MFA</p>
          <p className="mt-2 text-xl font-semibold">{user.mfaEnabled ? "Activado" : "Pendiente"}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Último origen</p>
          <p className="mt-2 text-xl font-semibold">{governanceSourceLabel(user.lastRoleSource)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Último gestor</p>
          <p className="mt-2 text-xl font-semibold">
            {user.lastRoleGrantedBy?.email ?? "Sin admin asociado"}
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
        <section className="rounded-xl border bg-card p-5">
          <h2 className="text-lg font-semibold">Resumen de gobernanza</h2>
          <div className="mt-4 space-y-3 text-sm">
            <div>
              <p className="text-muted-foreground">Roles actuales</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {user.roles.map((role) => (
                  <Badge key={role} variant={role === "ADMIN" ? "default" : "secondary"}>
                    {role}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="text-muted-foreground">Solicitud visible</p>
              <p className="mt-1">
                {user.requestedRole ? `${user.requestedRole} · ${user.roleStatus ?? "sin estado"}` : "Sin solicitud abierta"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Fecha de solicitud</p>
              <p className="mt-1">{user.requestedAt ? new Date(user.requestedAt).toLocaleString("es-ES") : "Sin fecha"}</p>
            </div>
          </div>
        </section>

        <section className="rounded-xl border bg-card p-5">
          <h2 className="text-lg font-semibold">Acciones administrativas</h2>
          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Cuenta</p>
              <Button type="button" onClick={handleStatusChange} disabled={acting === "block" || acting === "activate"}>
                {user.active ? "Bloquear usuario" : "Activar usuario"}
              </Button>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Conceder roles</p>
              <div className="flex flex-wrap gap-2">
                {availableGrants.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No quedan roles concedibles.</p>
                ) : (
                  availableGrants.map((role) => (
                    <Button
                      key={`grant-${role}`}
                      type="button"
                      variant="outline"
                      onClick={() => handleRoleChange(role, "grant")}
                      disabled={acting === `grant-${role}`}
                    >
                      Conceder {role}
                    </Button>
                  ))
                )}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Revocar roles</p>
              <div className="flex flex-wrap gap-2">
                {revocableRoles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No hay roles revocables.</p>
                ) : (
                  revocableRoles.map((role) => (
                    <Button
                      key={`revoke-${role}`}
                      type="button"
                      variant="outline"
                      onClick={() => handleRoleChange(role, "revoke")}
                      disabled={acting === `revoke-${role}`}
                    >
                      Revocar {role}
                    </Button>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Historial de gobernanza</h2>
            <p className="text-sm text-muted-foreground">
              Timeline de acciones de rol y estado registradas en backend.
            </p>
          </div>
          <span className="text-sm text-muted-foreground">{history.length} eventos</span>
        </div>

        {historyError ? (
          <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {historyError}
          </div>
        ) : null}

        {history.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            Este usuario todavía no tiene eventos de gobernanza registrados.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {history.map((entry) => (
              <div key={entry.id} className="rounded-lg border p-4">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="font-medium">{actionLabel(entry)}</p>
                    <p className="text-sm text-muted-foreground">
                      {entry.actorEmail ?? "Sistema"} · {entry.source ?? "Sin fuente"}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleString("es-ES")}
                  </p>
                </div>
                {entry.metadata ? (
                  <pre className="mt-3 overflow-x-auto rounded-md bg-muted p-3 text-xs">
                    {JSON.stringify(entry.metadata, null, 2)}
                  </pre>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
