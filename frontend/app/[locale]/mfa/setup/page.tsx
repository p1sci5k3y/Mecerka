"use client"

import React, { useState, useEffect } from "react"
import { useRouter } from "@/lib/navigation"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { authService } from "@/lib/services/auth-service"
import { Loader2, ShieldCheck } from "lucide-react"

export default function MfaSetupPage() {
    const { user, logout, isLoading } = useAuth()
    const router = useRouter()
    const [qrCode, setQrCode] = useState<string>("")
    const [token, setToken] = useState("")
    const [emailOtp, setEmailOtp] = useState("")
    const [step, setStep] = useState<1 | 2>(1)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (isLoading) return

        if (!user) {
            router.push("/login")
            return
        }

        if (user.mfaEnabled) {
            router.push("/dashboard")
            return
        }

        authService.generateMfaEmailOtp().then(() => {
            toast.success("Código enviado a tu correo")
        }).catch(() => {
            toast.error("Error al enviar el código a tu correo")
        })
    }, [user, router, isLoading])

    const handleVerifyEmail = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        try {
            const res: any = await authService.setupMfa(emailOtp)
            if (res.qrCode) {
                setQrCode(res.qrCode)
                setStep(2)
                toast.success("Código verificado")
            }
        } catch {
            toast.error("Código incorrecto o expirado")
        } finally {
            setLoading(false)
        }
    }

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        try {
            await authService.verifyMfa(token)
            toast.success("MFA activado correctamente")
            // Force reload or re-hydrate to update mfaEnabled status
            window.location.href = "/dashboard"
        } catch {
            toast.error("Código incorrecto")
        } finally {
            setLoading(false)
        }
    }

    if (isLoading) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    return (
        <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-background/50 selection:bg-primary/20">
            <div className="w-full max-w-md space-y-8 rounded-2xl border-2 border-dashed border-border/80 bg-card p-10 shadow-sm relative overflow-hidden">
                {/* Decorative absolute element */}
                <div className="absolute -top-4 -right-4 h-24 w-24 rounded-full bg-primary/5 blur-2xl pointer-events-none" />

                <div className="text-center relative z-10">
                    <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
                        <ShieldCheck className="h-7 w-7 text-primary" />
                    </div>
                    <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">Protege tu cuenta</h1>
                    <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                        {step === 1 ? "Hemos enviado un código de 6 dígitos a tu correo electrónico para confirmar tu identidad." : "Escanea el código con tu app de autenticación (Google Authenticator, Authy) para añadir esta capa extra."}
                    </p>
                </div>

                {step === 1 && (
                    <form onSubmit={handleVerifyEmail} className="space-y-6 relative z-10 mt-6">
                        <div className="space-y-3">
                            <Label htmlFor="emailOtp" className="text-sm font-semibold text-muted-foreground uppercase tracking-wider text-center block">
                                Código de Correo
                            </Label>
                            <Input
                                id="emailOtp"
                                placeholder="000 000"
                                value={emailOtp}
                                onChange={(e) => setEmailOtp(e.target.value)}
                                className="h-14 text-center text-2xl font-mono tracking-[0.5em] rounded-xl border-2 focus-visible:ring-primary shadow-sm"
                                maxLength={6}
                                required
                            />
                        </div>

                        <Button type="submit" size="lg" className="h-12 w-full font-bold shadow-sm rounded-xl" disabled={loading}>
                            {loading ? (
                                <>
                                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                    Verificando...
                                </>
                            ) : "Continuar"}
                        </Button>
                    </form>
                )}

                {step === 2 && (
                    <>
                        <div className="flex justify-center rounded-xl border border-border bg-white p-6 shadow-inner relative z-10 w-fit mx-auto mt-6">
                            {qrCode ? (
                                <img src={qrCode} alt="QR Code" className="h-44 w-44" />
                            ) : (
                                <div className="h-44 w-44 animate-pulse bg-muted rounded-md" />
                            )}
                        </div>

                        <form onSubmit={handleVerify} className="space-y-6 relative z-10 mt-6">
                            <div className="space-y-3">
                                <Label htmlFor="token" className="text-sm font-semibold text-muted-foreground uppercase tracking-wider text-center block">
                                    Código de Authenticator
                                </Label>
                                <Input
                                    id="token"
                                    placeholder="000 000"
                                    value={token}
                                    onChange={(e) => setToken(e.target.value)}
                                    className="h-14 text-center text-2xl font-mono tracking-[0.5em] rounded-xl border-2 focus-visible:ring-primary shadow-sm"
                                    maxLength={6}
                                    required
                                />
                            </div>

                            <Button type="submit" size="lg" className="h-12 w-full font-bold shadow-sm rounded-xl" disabled={loading}>
                                {loading ? (
                                    <>
                                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                        Vinculando...
                                    </>
                                ) : "Confirmar Seguridad"}
                            </Button>
                        </form>
                    </>
                )}

                <div className="text-center relative z-10 pt-4 border-t border-border/50">
                    <button onClick={logout} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                        Lo haré más tarde (Cerrar sesión)
                    </button>
                </div>
            </div>
        </div>
    )
}
