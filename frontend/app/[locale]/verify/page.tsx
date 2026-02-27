"use client"

import React, { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useRouter } from "@/lib/navigation"
import { authService } from "@/lib/services/auth-service"
import { CheckCircle2, XCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Link } from "@/lib/navigation"

export default function VerifyEmailPage() {
    const searchParams = useSearchParams()
    const token = searchParams.get("token")
    const router = useRouter()

    const [status, setStatus] = useState<"loading" | "success" | "error">("loading")
    const [message, setMessage] = useState("Verificando tu cuenta...")

    useEffect(() => {
        if (!token) {
            setStatus("error")
            setMessage("Enlace inválido o sin token de verificación.")
            return
        }

        const verify = async () => {
            try {
                await authService.verifyEmail(token)
                setStatus("success")
                setMessage("Tu cuenta ha sido verificada correctamente. Ya puedes iniciar sesión.")
            } catch (error: any) {
                setStatus("error")
                setMessage(error.message || "Enlace expirado o inválido. Tu cuenta no pudo ser verificada.")
            }
        }

        verify()
    }, [token])

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#fbf6ee] p-4 text-slate-900 font-display">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center border border-[#e07d61]/20">
                <div className="flex justify-center mb-6">
                    {status === "loading" && (
                        <Loader2 className="w-16 h-16 text-[#e07d61] animate-spin" />
                    )}
                    {status === "success" && (
                        <div className="w-20 h-20 bg-green-50 text-green-600 rounded-full flex items-center justify-center">
                            <CheckCircle2 className="w-10 h-10" />
                        </div>
                    )}
                    {status === "error" && (
                        <div className="w-20 h-20 bg-red-50 text-red-600 rounded-full flex items-center justify-center">
                            <XCircle className="w-10 h-10" />
                        </div>
                    )}
                </div>

                <h1 className="font-serif text-3xl font-bold mb-4">
                    {status === "loading" ? "Verificando..." : status === "success" ? "¡Cuenta Activada!" : "Error de Verificación"}
                </h1>

                <p className="text-slate-600 mb-8 leading-relaxed">
                    {message}
                </p>

                {status !== "loading" && (
                    <Button asChild className="w-full bg-[#e07d61] hover:bg-[#e07d61]/90 text-white font-bold h-12 rounded-xl">
                        <Link href="/login">Ir a Iniciar Sesión</Link>
                    </Button>
                )}
            </div>
        </div>
    )
}
