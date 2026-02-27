"use client"

import React, { useState } from "react"
import {
  User,
  Mail,
  Shield,
  Key,
  Clock,
  Monitor,
  Smartphone,
  Info,
  Loader2,
  CheckCircle2,
  Fingerprint,
} from "lucide-react"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { ProtectedRoute } from "@/components/protected-route"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { TagChip } from "@/components/ui/tag-chip"
import { SealBadge } from "@/components/ui/seal-badge"
import { SectionHeader } from "@/components/ui/section-header"
import { Link } from "@/lib/navigation"

const mockSessions = [
  { device: "Chrome en macOS", icon: Monitor, lastActive: "Ahora", current: true },
  { device: "Safari en iPhone", icon: Smartphone, lastActive: "Hace 2h", current: false },
]

const mockAccessHistory = [
  { date: "10 Feb 2026, 09:30", action: "Inicio de sesión", ip: "192.168.1.***" },
  { date: "9 Feb 2026, 14:15", action: "Inicio de sesión", ip: "10.0.0.***" },
  { date: "8 Feb 2026, 20:00", action: "Cambio de contraseña", ip: "192.168.1.***" },
]

export default function ProfilePage() {
  return (
    <ProtectedRoute>
      <ProfileContent />
    </ProtectedRoute>
  )
}

function ProfileContent() {
  const { user } = useAuth()
  const [settingPin, setSettingPin] = useState(false)
  const [pinValue, setPinValue] = useState("")

  const handlePinSetup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pinValue.length < 4 || pinValue.length > 6) {
      toast.error("El PIN debe tener entre 4 y 6 números.")
      return
    }

    setSettingPin(true)
    try {
      await api.post<{ message: string }>("/users/pin", { pin: pinValue })
      toast.success("PIN transaccional configurado correctamente. Ya puedes realizar pedidos.", { icon: "🔐" })

      // Update local storage / user context state lazily if possible, 
      // but reloading is a quick way to refresh the 'hasPin' state from login.
      setTimeout(() => window.location.reload(), 1500)
    } catch (error: any) {
      toast.error(error.message || "Error al configurar el PIN.")
    } finally {
      setSettingPin(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background selection:bg-primary/20">
      <Navbar />
      <main className="flex-1">

        {/* Editorial Header */}
        <div className="bg-[#FBF6EE] border-b border-border/60 py-12 relative overflow-hidden">
          <div className="container relative z-10 px-4 md:px-6 max-w-4xl">
            <SealBadge className="mb-4 shadow-none bg-transparent">Libro de Registro</SealBadge>
            <h1 className="font-display text-4xl font-extrabold text-foreground tracking-tight sm:text-5xl">
              Ficha Personal
            </h1>
            <p className="mt-2 text-lg text-foreground/80 font-medium">
              Gestiona tu identidad, privacidad y roles dentro de Mecerka.
            </p>
          </div>
          <div className="absolute -right-20 -top-20 h-[300px] w-[300px] rounded-full bg-primary/5 blur-[80px] pointer-events-none" />
        </div>

        <div className="mx-auto max-w-4xl px-4 py-12 lg:px-8 space-y-12">

          {/* User info */}
          <section>
            <SectionHeader title="Datos del Cuaderno" subtitle="Tu información básica en la plataforma." />
            <div className="mt-6 rounded-2xl border border-border/80 bg-card p-6 sm:p-8 shadow-sm">
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5 p-4 rounded-xl bg-muted/30 border border-border/50">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> Nombre</span>
                  <span className="text-base font-bold text-foreground">{user?.name}</span>
                </div>
                <div className="flex flex-col gap-1.5 p-4 rounded-xl bg-muted/30 border border-border/50">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> Correo Postal</span>
                  <span className="text-base font-medium text-foreground">{user?.email}</span>
                </div>

                <div className="flex flex-col gap-1.5 p-4 rounded-xl bg-muted/30 border border-border/50">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Shield className="h-3.5 w-3.5" /> Tus Roles</span>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {user?.roles?.map((role) => (
                      <TagChip key={role} variant="outline" className="text-xs font-bold">
                        {roleLabel[role] || role}
                      </TagChip>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 p-4 rounded-xl bg-muted/30 border border-border/50">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Fingerprint className="h-3.5 w-3.5" /> Seguridad Extendida (MFA)</span>
                  <div className="flex items-center gap-3 mt-1">
                    {user?.mfaEnabled ? (
                      <TagChip variant="default" className="text-xs w-fit">
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Protegido
                      </TagChip>
                    ) : (
                      <>
                        <TagChip variant="accent" className="text-xs w-fit">Desactivado</TagChip>
                        <Link href="/mfa/setup" className="text-xs font-bold text-primary hover:underline">Configurar</Link>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Transaction PIN */}
          <section>
            <SectionHeader title="Firma de Transacciones" subtitle="Configura tu PIN (4-6 dígitos) para autorizar tus compras de forma segura." />
            <div className="mt-6 rounded-2xl border border-border/80 bg-card p-6 sm:p-8 shadow-sm max-w-md">

              {user?.hasPin ? (
                <div className="flex items-start gap-4 p-4 rounded-xl bg-primary/5 border border-primary/20 mb-6">
                  <CheckCircle2 className="h-6 w-6 text-primary shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-bold text-foreground">PIN Configurado</h3>
                    <p className="text-xs text-muted-foreground mt-1">Tu cuenta ya está habilitada para autorizar transacciones de compra. Puedes actualizar tu PIN usando el formulario interior.</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-4 p-4 rounded-xl bg-accent text-accent-foreground mb-6">
                  <Info className="h-6 w-6 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-bold">PIN Pendiente</h3>
                    <p className="text-xs mt-1">Necesitas configurar un PIN numérico antes de poder realizar compras en Mecerka.</p>
                  </div>
                </div>
              )}

              <form onSubmit={handlePinSetup} className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="transaction-pin" className="text-sm font-semibold text-muted-foreground">
                    {user?.hasPin ? "Cifrar Nuevo PIN" : "Nuevo PIN Transaccional"}
                  </Label>
                  <Input
                    id="transaction-pin"
                    type="password"
                    maxLength={6}
                    placeholder="Ej. 1234"
                    className="h-12 rounded-xl text-center font-mono tracking-widest text-lg"
                    value={pinValue}
                    onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ""))}
                    required
                  />
                </div>
                <Button type="submit" className="w-full font-bold h-12 rounded-xl shadow-sm mt-2" disabled={settingPin}>
                  {settingPin ? (
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  ) : (user?.hasPin ? "Actualizar PIN" : "Guardar PIN")}
                </Button>
              </form>
            </div>
          </section>

          {/* Role Management */}
          <section>
            <SectionHeader title="Solicitud de Puestos" subtitle="Únete a la red de producción y reparto local." />
            <div className="mt-6 rounded-2xl border border-border/80 bg-card p-6 sm:p-8 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row">
                {!user?.roles?.includes("PROVIDER") && (
                  <Button
                    onClick={async () => {
                      try {
                        const res = await api.post<{ message: string, roles: string[], access_token: string }>("/users/roles/provider")
                        if (res.access_token) localStorage.setItem("token", res.access_token)
                        toast.success("¡Bienvenido al Gremio de Talleres!", { icon: "🔨" })
                        window.location.reload()
                      } catch (error) {
                        toast.error("Error al inscribir tu taller")
                      }
                    }}
                    variant="outline"
                    className="h-12 px-6 rounded-xl font-bold border-2 max-w-xs"
                  >
                    Abrir un Taller
                  </Button>
                )}
                {!user?.roles?.includes("RUNNER") && (
                  <Button
                    onClick={async () => {
                      try {
                        const res = await api.post<{ message: string, roles: string[], access_token: string }>("/users/roles/runner")
                        if (res.access_token) localStorage.setItem("token", res.access_token)
                        toast.success("¡Licencia de Reparto aprobada!", { icon: "🚲" })
                        window.location.reload()
                      } catch (error) {
                        toast.error("Error al emitir licencia")
                      }
                    }}
                    variant="outline"
                    className="h-12 px-6 rounded-xl font-bold border-2 max-w-xs transition-colors hover:bg-primary/5 hover:text-primary hover:border-primary/20"
                  >
                    Licencia de Repartidor
                  </Button>
                )}
                {user?.roles?.includes("PROVIDER") && user?.roles?.includes("RUNNER") && (
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/5 border border-primary/20 text-primary">
                    <CheckCircle2 className="h-5 w-5" />
                    <p className="text-sm font-bold">Ostentas todos los rangos posibles en esta ciudad.</p>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Devices and Sessions */}
          <div className="grid sm:grid-cols-2 gap-8">
            <section>
              <h2 className="flex items-center gap-2 font-display text-lg font-bold text-foreground mb-4 border-b border-border/50 pb-2">
                <Monitor className="h-5 w-5 text-muted-foreground" />
                Dispositivos Vinculados
              </h2>
              <div className="flex flex-col gap-3">
                {mockSessions.map((s) => (
                  <div key={s.device} className="flex items-center justify-between rounded-xl border border-border/80 bg-card p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 flex items-center justify-center rounded-lg bg-muted/50">
                        <s.icon className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-foreground leading-tight">{s.device}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{s.lastActive}</p>
                      </div>
                    </div>
                    {s.current ? (
                      <TagChip variant="outline" className="text-[10px] px-2 py-0.5 whitespace-nowrap">Actual</TagChip>
                    ) : (
                      <button className="text-xs font-bold text-destructive hover:underline">Revocar</button>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h2 className="flex items-center gap-2 font-display text-lg font-bold text-foreground mb-4 border-b border-border/50 pb-2">
                <Clock className="h-5 w-5 text-muted-foreground" />
                Bitácora de Accesos
              </h2>
              <div className="overflow-x-auto rounded-xl border border-border/80 bg-card p-0 shadow-sm">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-border/60">
                    {mockAccessHistory.map((entry, idx) => (
                      <tr key={idx} className="hover:bg-muted/20 transition-colors">
                        <td className="py-3 px-4 font-medium text-foreground">{entry.action}</td>
                        <td className="py-3 px-4 text-muted-foreground text-right font-mono text-xs">{entry.date.split(",")[0]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

        </div>
      </main>
      <Footer />
    </div>
  )
}
