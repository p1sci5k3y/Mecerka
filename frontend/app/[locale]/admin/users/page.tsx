"use client"

import { useEffect, useState } from "react"
import {
    MoreHorizontal,
    Shield,
    ShieldAlert,
    UserCheck,
    UserX,
} from "lucide-react"
import { adminService } from "@/lib/services/admin-service"
import { BackendAdminUser, Role } from "@/lib/types"
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

export default function UsersPage() {
    const [users, setUsers] = useState<BackendAdminUser[]>([])
    const [loading, setLoading] = useState(true)
    const { toast } = useToast()

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const data = await adminService.getUsers()
                setUsers(data)
            } catch (error) {
                toast({
                    title: "Error",
                    description: "No se pudieron cargar los usuarios",
                    variant: "destructive",
                })
            } finally {
                setLoading(false)
            }
        }
        fetchUsers()
    }, [toast])

    const handleRoleChange = async (userId: number, newRole: Role) => {
        try {
            await adminService.updateUserRole(userId, newRole)
            toast({ title: "Rol actualizado correctamente" })
            // Re-fetch users after role change
            const data = await adminService.getUsers()
            setUsers(data)
        } catch (error) {
            toast({
                title: "Error",
                description: "No se pudo actualizar el rol",
                variant: "destructive",
            })
        }
    }

    const handleStatusChange = async (userId: number, currentStatus: boolean) => {
        try {
            if (currentStatus) {
                await adminService.blockUser(userId)
                toast({ title: "Usuario bloqueado" })
            } else {
                await adminService.activateUser(userId)
                toast({ title: "Usuario activado" })
            }
            fetchUsers()
        } catch (error) {
            toast({
                title: "Error",
                description: "No se pudo cambiar el estado",
                variant: "destructive",
            })
        }
    }

    if (loading) return <div className="p-8">Cargando usuarios...</div>

    return (
        <div>
            <h1 className="mb-8 font-display text-3xl font-bold">Gestión de Usuarios</h1>

            <div className="rounded-md border bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Nombre</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Rol</TableHead>
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
                                        {(user.roles || []).map(role => (
                                            <Badge key={role} variant={role === "ADMIN" ? "default" : "secondary"}>
                                                {role}
                                            </Badge>
                                        ))}
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
                                            <DropdownMenuItem
                                                onClick={() => navigator.clipboard.writeText(user.email)}
                                            >
                                                Copiar Email
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            {/* Role management to be updated for multi-role support 
                                            <DropdownMenuLabel>Cambiar Rol</DropdownMenuLabel>
                                            <DropdownMenuItem onClick={() => handleRoleChange(user.id, "CLIENT")}>
                                                A: Client
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => handleRoleChange(user.id, "PROVIDER")}>
                                                A: Provider
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => handleRoleChange(user.id, "ADMIN")}>
                                                <Shield className="mr-2 h-4 w-4" />
                                                A: Admin
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            */}
                                            <DropdownMenuItem
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
