"use client"

import { Link, usePathname } from "@/lib/navigation"
import {
    LayoutDashboard,
    Users,
    MapPin,
    Tag,
    LogOut,
} from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"

const sidebarItems = [
    {
        title: "Dashboard",
        href: "/admin",
        icon: LayoutDashboard,
    },
    {
        title: "Usuarios",
        href: "/admin/users",
        icon: Users,
    },
    {
        title: "Ciudades",
        href: "/admin/masters?tab=cities",
        icon: MapPin,
    },
    {
        title: "Categorías",
        href: "/admin/masters?tab=categories",
        icon: Tag,
    },
]

export function AdminSidebar() {
    const pathname = usePathname()
    const { logout } = useAuth()

    return (
        <div className="flex h-screen w-64 flex-col border-r bg-card">
            <div className="flex h-16 items-center border-b px-6">
                <Link href="/" className="flex items-center gap-2 font-display text-xl font-bold">
                    <span className="text-primary">Mecerka</span>
                    <span className="text-muted-foreground">Admin</span>
                </Link>
            </div>

            <div className="flex-1 overflow-y-auto py-4">
                <nav className="space-y-1 px-3">
                    {sidebarItems.map((item) => {
                        const isActive = pathname === item.href || (item.href !== "/admin" && pathname?.startsWith(item.href))
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isActive
                                    ? "bg-primary/10 text-primary"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                    }`}
                            >
                                <item.icon className="h-4 w-4" />
                                {item.title}
                            </Link>
                        )
                    })}
                </nav>
            </div>

            <div className="border-t p-4">
                <Button
                    variant="ghost"
                    className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
                    onClick={logout}
                >
                    <LogOut className="h-4 w-4" />
                    Cerrar sesión
                </Button>
            </div>
        </div>
    )
}
