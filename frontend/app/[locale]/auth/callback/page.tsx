"use client"

import { Suspense } from "react"
import { Link } from "@/lib/navigation"
import { Button } from "@/components/ui/button"
import { AlertCircle } from "lucide-react"

function CallbackContent() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-background px-4">
            <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
                <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                    <AlertCircle className="h-7 w-7 text-primary" />
                </div>
                <h1 className="font-display text-2xl font-bold text-foreground">Acceso por enlace no disponible</h1>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    Esta versión del MVP utiliza acceso con correo, contraseña y MFA. Los enlaces mágicos y su callback público ya no forman parte del flujo operativo real.
                </p>
                <div className="mt-6">
                    <Link href="/login">
                        <Button className="w-full">Ir a iniciar sesión</Button>
                    </Link>
                </div>
            </div>
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
