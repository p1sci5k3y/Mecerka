"use client"

import { useCallback, useEffect, useState } from "react"
import {
    BadgeCheck,
    Clock3,
    MoreHorizontal,
    Shield,
    UserCheck,
    UserX,
} from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
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
    if (user.lastRoleSource === "USER_REQUEST") return "Originado por solicitud"
    if (user.lastRoleSource === "DEMO") return "Sembrado por demo"
    return "Sin histórico reciente"
}

export default function UsersPage() {
    const [users, setUsers] = useState<BackendAdminUser[]>([])
    const [loading, setLoading] = useState(true)
    const [actingUserId, setActingUserId] = useState<string | null>(null)
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

    if (loading) return <div className="p-8">Cargando usuarios...</div>

    const pendingRoleApprovals = users.filter((candidate) => candidate.roleStatus === "PENDING").length
    const blockedUsers = users.filter((candidate) => !candidate.active).length

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
                        {users.map((user) => (
                            <TableRow key={user.id}>
                                <TableCell className="font-medium">{user.name}</TableCell>
                                <TableCell>{user.email}</TableCell>
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
