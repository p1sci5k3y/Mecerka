"use client"

import React, { useEffect, Suspense } from "react"
import { useRouter } from "@/lib/navigation"
import { useSearchParams } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { authService } from "@/lib/services/auth-service"
import { getPrimaryRouteForUser } from "@/lib/role-navigation"

function CallbackContent() {
    const searchParams = useSearchParams()
    const token = searchParams.get("token")
    const { verifyMagicLink } = useAuth()
    const router = useRouter()

    const verifiedRef = React.useRef(false)

    useEffect(() => {
        if (!token || verifiedRef.current) return

        const verify = async () => {
            verifiedRef.current = true
            try {
                await verifyMagicLink(token)
                const user = await authService.getProfile()
                toast.success("Acceso concedido")
                globalThis.location.href = getPrimaryRouteForUser(user)
            } catch (error) {
                console.error(error)
                toast.error("El enlace ha expirado o no es válido")
                router.push("/login")
            } finally {
                // No cleanup needed
            }
        }

        verify()
    }, [token, verifyMagicLink, router])

    return (
        <div className="flex min-h-screen items-center justify-center flex-col gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Verificando acceso...</p>
        </div>
    )
}

export default function CallbackPage() {
    return (
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Cargando...</div>}>
            <CallbackContent />
        </Suspense>
    )
}
