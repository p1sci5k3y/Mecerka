"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
    BadgeCheck,
    Clock3,
    MoreHorizontal,
    Shield,
    UserCheck,
    UserX,
} from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { Link } from "@/lib/navigation"
import { BackendAdminUser, Role } from "@/lib/types"
import { adminService } from "@/lib/services/admin-service"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { useToast } from "@/components/ui/use-toast"

function hasRole(user: BackendAdminUser, role: Role) {
    return user.roles.includes(role)
}

function roleRequestLabel(user: BackendAdminUser) {
    if (!user.requestedRole || !user.roleStatus) return "Sin solicitud abierta"
    if (user.roleStatus === "PENDING") return `Solicitud ${user.requestedRole} pendiente`
    if (user.roleStatus === "APPROVED") return `${user.requestedRole} aprobada`
    return `${user.requestedRole} rechazada`
}

function governanceSourceLabel(user: BackendAdminUser) {
    if (user.lastRoleSource === "ADMIN") return "Concedido por admin"
    if (user.lastRoleSource === "SELF_SERVICE") return "Originado por autoservicio"
    return "Sin histórico reciente"
}

export default function UsersPage() {
    const [users, setUsers] = useState<BackendAdminUser[]>([])
    const [loading, setLoading] = useState(true)
    const [actingUserId, setActingUserId] = useState<string | null>(null)
    const [search, setSearch] = useState("")
    const [roleFilter, setRoleFilter] = useState<"ALL" | Role>("ALL")
    const [accountFilter, setAccountFilter] = useState<"ALL" | "ACTIVE" | "BLOCKED">("ALL")
    const [governanceFilter, setGovernanceFilter] = useState<
        "ALL" | "REQUESTED" | "SELF_SERVICE" | "ADMIN" | "MFA_PENDING"
    >("ALL")
    const { toast } = useToast()
    const { user: currentUser } = useAuth()

    const fetchUsers = useCallback(async () => {
        try {
            const data = await adminService.getUsers()
            setUsers(data)
        } catch (error) {
            console.error("Error cargando usuarios:", error)
            toast({
                title: "Error",
                description: "No se pudieron cargar los usuarios",
                variant: "destructive",
            })
        } finally {
            setLoading(false)
        }
    }, [toast])

    useEffect(() => {
        fetchUsers()
    }, [fetchUsers])

    const handleStatusChange = async (userId: string, currentStatus: boolean) => {
        try {
            setActingUserId(userId)
            if (currentStatus) {
                await adminService.blockUser(userId)
                toast({ title: "Usuario bloqueado" })
            } else {
                await adminService.activateUser(userId)
                toast({ title: "Usuario activado" })
            }
            await fetchUsers()
        } catch (error) {
            console.error(error)
            toast({
                title: "Error",
                description: "No se pudo cambiar el estado",
                variant: "destructive",
            })
        } finally {
            setActingUserId(null)
        }
    }

    const handleRoleChange = async (userId: string, role: Role, action: "grant" | "revoke") => {
        try {
            setActingUserId(userId)
            if (action === "grant") {
                await adminService.grantRole(userId, role)
                toast({ title: `Rol ${role} concedido` })
            } else {
                await adminService.revokeRole(userId, role)
                toast({ title: `Rol ${role} revocado` })
            }
            await fetchUsers()
        } catch (error) {
            console.error(error)
            toast({
                title: "Error",
                description: `No se pudo ${action === "grant" ? "conceder" : "revocar"} el rol ${role}`,
                variant: "destructive",
            })
        } finally {
            setActingUserId(null)
        }
    }

    const pendingRoleApprovals = users.filter((candidate) => candidate.roleStatus === "PENDING").length
    const blockedUsers = users.filter((candidate) => !candidate.active).length
    const filteredUsers = useMemo(() => {
        const normalizedSearch = search.trim().toLowerCase()
        return users.filter((candidate) => {
            if (
                normalizedSearch.length > 0 &&
                !candidate.name.toLowerCase().includes(normalizedSearch) &&
                !candidate.email.toLowerCase().includes(normalizedSearch)
            ) {
                return false
            }

            if (roleFilter !== "ALL" && !candidate.roles.includes(roleFilter)) {
                return false
            }

            if (accountFilter === "ACTIVE" && !candidate.active) {
                return false
            }

            if (accountFilter === "BLOCKED" && candidate.active) {
                return false
            }

            if (governanceFilter === "REQUESTED" && candidate.roleStatus !== "PENDING") {
                return false
            }

            if (governanceFilter === "SELF_SERVICE" && candidate.lastRoleSource !== "SELF_SERVICE") {
                return false
            }

            if (governanceFilter === "ADMIN" && candidate.lastRoleSource !== "ADMIN") {
                return false
            }

            if (governanceFilter === "MFA_PENDING" && candidate.mfaEnabled) {
                return false
            }

            return true
        })
    }, [accountFilter, governanceFilter, roleFilter, search, users])

    if (loading) return <div className="p-8">Cargando usuarios...</div>

    return (
        <div>
            <h1 className="mb-8 font-display text-3xl font-bold">Gestión de Usuarios</h1>

            <div className="mb-6 grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border bg-card p-4">
                    <p className="text-sm text-muted-foreground">Usuarios totales</p>
                    <p className="mt-2 text-3xl font-semibold">{users.length}</p>
                </div>
                <div className="rounded-xl border bg-card p-4">
                    <p className="text-sm text-muted-foreground">Solicitudes pendientes</p>
                    <p className="mt-2 text-3xl font-semibold">{pendingRoleApprovals}</p>
                </div>
                <div className="rounded-xl border bg-card p-4">
                    <p className="text-sm text-muted-foreground">Usuarios bloqueados</p>
                    <p className="mt-2 text-3xl font-semibold">{blockedUsers}</p>
                </div>
            </div>

            <div className="mb-6 rounded-xl border bg-card p-4">
                <div className="grid gap-4 lg:grid-cols-4">
                    <label className="space-y-2 text-sm">
                        <span className="font-medium">Buscar</span>
                        <input
                            aria-label="Buscar usuarios"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Nombre o email"
                            className="h-10 w-full rounded-md border bg-background px-3"
                        />
                    </label>
                    <label className="space-y-2 text-sm">
                        <span className="font-medium">Rol</span>
                        <select
                            aria-label="Filtrar por rol"
                            value={roleFilter}
                            onChange={(event) => setRoleFilter(event.target.value as "ALL" | Role)}
                            className="h-10 w-full rounded-md border bg-background px-3"
                        >
                            <option value="ALL">Todos</option>
                            <option value="CLIENT">CLIENT</option>
                            <option value="PROVIDER">PROVIDER</option>
                            <option value="RUNNER">RUNNER</option>
                            <option value="ADMIN">ADMIN</option>
                        </select>
                    </label>
                    <label className="space-y-2 text-sm">
                        <span className="font-medium">Estado de cuenta</span>
                        <select
                            aria-label="Filtrar por estado de cuenta"
                            value={accountFilter}
                            onChange={(event) => setAccountFilter(event.target.value as "ALL" | "ACTIVE" | "BLOCKED")}
                            className="h-10 w-full rounded-md border bg-background px-3"
                        >
                            <option value="ALL">Todos</option>
                            <option value="ACTIVE">Activos</option>
                            <option value="BLOCKED">Bloqueados</option>
                        </select>
                    </label>
                    <label className="space-y-2 text-sm">
                        <span className="font-medium">Gobernanza</span>
                        <select
                            aria-label="Filtrar por gobernanza"
                            value={governanceFilter}
                            onChange={(event) => setGovernanceFilter(event.target.value as "ALL" | "REQUESTED" | "SELF_SERVICE" | "ADMIN" | "MFA_PENDING")}
                            className="h-10 w-full rounded-md border bg-background px-3"
                        >
                            <option value="ALL">Todas</option>
                            <option value="REQUESTED">Solicitudes abiertas</option>
                            <option value="SELF_SERVICE">Autoservicio</option>
                            <option value="ADMIN">Concedido por admin</option>
                            <option value="MFA_PENDING">MFA pendiente</option>
                        </select>
                    </label>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                    Mostrando {filteredUsers.length} de {users.length} usuarios.
                </p>
            </div>

            <div className="rounded-md border bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Nombre</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Roles</TableHead>
                            <TableHead>Gobernanza</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredUsers.map((user) => (
                            <TableRow key={user.id}>
                                <TableCell className="font-medium">{user.name}</TableCell>
                                <TableCell>
                                    <div className="space-y-1">
                                        <p>{user.email}</p>
                                        <Link href={`/admin/users/${user.id}`} className="text-xs font-medium text-primary underline-offset-4 hover:underline">
                                            Abrir detalle
                                        </Link>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex flex-wrap gap-1">
                                        {user.roles.map((role) => (
                                            <Badge key={role} variant={role === "ADMIN" ? "default" : "secondary"}>
                                                {role}
                                            </Badge>
                                        ))}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="space-y-1 text-sm">
                                        <div className="flex items-center gap-2">
                                            {user.roleStatus === "PENDING" ? (
                                                <Clock3 className="h-4 w-4 text-amber-600" />
                                            ) : (
                                                <BadgeCheck className="h-4 w-4 text-emerald-600" />
                                            )}
                                            <span>{roleRequestLabel(user)}</span>
                                        </div>
                                        <p className="text-xs text-muted-foreground">{governanceSourceLabel(user)}</p>
                                        <p className="text-xs text-muted-foreground">
                                            MFA {user.mfaEnabled ? "activado" : "pendiente"}
                                        </p>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    {user.active ? (
                                        <div className="flex items-center gap-2 text-green-600">
                                            <UserCheck className="h-4 w-4" />
                                            <span className="text-xs font-medium">Activo</span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2 text-destructive">
                                            <UserX className="h-4 w-4" />
                                            <span className="text-xs font-medium">Bloqueado</span>
                                        </div>
                                    )}
                                </TableCell>
                                <TableCell className="text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" className="h-8 w-8 p-0">
                                                <span className="sr-only">Abrir menú</span>
                                                <MoreHorizontal className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                                            <DropdownMenuItem onClick={() => navigator.clipboard.writeText(user.email)}>
                                                Copiar Email
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuLabel>Conceder roles</DropdownMenuLabel>
                                            {!hasRole(user, "PROVIDER") && (
                                                <DropdownMenuItem onClick={() => handleRoleChange(user.id, "PROVIDER", "grant")}>
                                                    Conceder PROVIDER
                                                </DropdownMenuItem>
                                            )}
                                            {!hasRole(user, "RUNNER") && (
                                                <DropdownMenuItem onClick={() => handleRoleChange(user.id, "RUNNER", "grant")}>
                                                    Conceder RUNNER
                                                </DropdownMenuItem>
                                            )}
                                            {!hasRole(user, "ADMIN") && (
                                                <DropdownMenuItem onClick={() => handleRoleChange(user.id, "ADMIN", "grant")}>
                                                    <Shield className="mr-2 h-4 w-4" />
                                                    Conceder ADMIN
                                                </DropdownMenuItem>
                                            )}
                                            {user.roleStatus === "PENDING" && user.requestedRole ? (
                                                !hasRole(user, user.requestedRole) ? (
                                                    <DropdownMenuItem onClick={() => handleRoleChange(user.id, user.requestedRole as Role, "grant")}>
                                                        Aprobar solicitud {user.requestedRole}
                                                    </DropdownMenuItem>
                                                ) : null
                                            ) : null}
                                            <DropdownMenuSeparator />
                                            <DropdownMenuLabel>Revocar roles</DropdownMenuLabel>
                                            {user.roles.map((role) => {
                                                const isSelfAdminRole = currentUser?.userId === user.id && role === "ADMIN"
                                                if (user.roles.length === 1 || isSelfAdminRole) return null
                                                return (
                                                    <DropdownMenuItem key={`revoke-${role}`} onClick={() => handleRoleChange(user.id, role, "revoke")}>
                                                        Revocar {role}
                                                    </DropdownMenuItem>
                                                )
                                            })}
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                                disabled={actingUserId === user.id || currentUser?.userId === user.id}
                                                className={user.active ? "text-destructive" : "text-green-600"}
                                                onClick={() => handleStatusChange(user.id, user.active)}
                                            >
                                                {user.active ? (
                                                    <>
                                                        <UserX className="mr-2 h-4 w-4" />
                                                        Bloquear
                                                    </>
                                                ) : (
                                                    <>
                                                        <UserCheck className="mr-2 h-4 w-4" />
                                                        Activar
                                                    </>
                                                )}
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}
