"use client"

import { ProtectedRoute } from "@/components/protected-route"
import { AdminSidebar } from "@/components/admin-sidebar"

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <ProtectedRoute allowedRoles={["ADMIN"]}>
            <div className="flex min-h-screen bg-background text-foreground">
                <AdminSidebar />
                <main className="flex-1 overflow-y-auto bg-muted/10 p-8">
                    {children}
                </main>
            </div>
        </ProtectedRoute>
    )
}
