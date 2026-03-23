"use client"

import React, { useEffect, useState } from "react"
import {

  Mail,
  Shield,
  Info,

  CheckCircle2,
  Fingerprint,
  User,
  Loader2
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
import { usersService } from "@/lib/services/users-service"

const roleLabel: Record<string, string> = {
  ADMIN: "Admin",
  CLIENT: "Cliente",
  PROVIDER: "Proveedor",
  RUNNER: "Repartidor"
}

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
  const [requestingRole, setRequestingRole] = useState(false)
  const [requestedRole, setRequestedRole] = useState<"PROVIDER" | "RUNNER">("PROVIDER")
  const [country, setCountry] = useState("ES")
  const [fiscalId, setFiscalId] = useState("")

  const getErrorInfo = (error: unknown) => {
    const fallback = {
      message: "Ha ocurrido un error",
      statusCode: null as number | null,
    }

    if (error instanceof Error) {
      return {
        message: error.message || fallback.message,
        statusCode: null,
      }
    }

    if (typeof error === "object" && error !== null) {
      const message =
        "message" in error && typeof error.message === "string"
          ? error.message
          : fallback.message
      const statusCode =
        "statusCode" in error && typeof error.statusCode === "number"
          ? error.statusCode
          : null

      return { message, statusCode }
    }

    return fallback
  }

  const availableRoles = (["PROVIDER", "RUNNER"] as const).filter(
    (role) => !user?.roles?.includes(role),
  )

  const roleRequestLabel: Record<"PROVIDER" | "RUNNER", string> = {
    PROVIDER: "Solicitar alta como proveedor",
    RUNNER: "Solicitar licencia de repartidor",
  }

  useEffect(() => {
    if (availableRoles.length === 0) {
      return
    }

    setRequestedRole((current) =>
      availableRoles.includes(current) ? current : availableRoles[0],
    )
  }, [availableRoles])

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
      setTimeout(() => globalThis.location.reload(), 1500)
    } catch (error: unknown) {
      toast.error(getErrorInfo(error).message || "Error al configurar el PIN.")
    } finally {
      setSettingPin(false)
    }
  }

  const handleRoleRequest = async (e: React.FormEvent) => {
    e.preventDefault()

    if (availableRoles.length === 0) {
      return
    }

    setRequestingRole(true)
    try {
      const response = await usersService.requestRole({
        role: requestedRole,
        country,
        fiscalId,
      })

      toast.success(response.message || "Solicitud tramitada correctamente.")
      setFiscalId("")
      setTimeout(() => globalThis.location.reload(), 1200)
    } catch (error: unknown) {
      const { statusCode, message } = getErrorInfo(error)

      if (statusCode === 401) {
        toast.error("Tu sesión ha caducado. Vuelve a iniciar sesión.")
      } else if (statusCode === 403) {
        toast.error(
          "Debes completar la verificación MFA de esta sesión antes de solicitar un rol.",
        )
      } else if (statusCode === 400 || statusCode === 409) {
        toast.error(message)
      } else {
        toast.error("No se pudo tramitar la solicitud de rol.")
      }
    } finally {
      setRequestingRole(false)
    }
  }

  const canRequestRole = availableRoles.includes(requestedRole)

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

          {/* MFA Management */}
          <section>
            <SectionHeader title="Autenticación de Dos Pasos (MFA)" subtitle="Añade una capa extra de seguridad a tu cuenta usando una aplicación Authenticator." />
            <div className="mt-6 rounded-2xl border border-border/80 bg-card p-6 sm:p-8 shadow-sm max-w-md">
              {user?.mfaEnabled ? (
                <div className="flex items-start gap-4 p-4 rounded-xl bg-primary/5 border border-primary/20 mb-6">
                  <CheckCircle2 className="h-6 w-6 text-primary shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-bold text-foreground">MFA Activado</h3>
                    <p className="text-xs text-muted-foreground mt-1">Tu cuenta está protegida con la autenticación de doble factor en cada dispositivo nuevo.</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-5">
                  <div className="flex items-start gap-4 p-4 rounded-xl bg-accent text-accent-foreground mb-2">
                    <Shield className="h-6 w-6 shrink-0 mt-0.5" />
                    <div>
                      <h3 className="text-sm font-bold">Seguridad Recomendada</h3>
                      <p className="text-xs mt-1">Protege tu cuenta de accesos no autorizados añadiendo la verificación en dos pasos mediante una app autenticadora como Google Authenticator o Authy.</p>
                    </div>
                  </div>
                  <Button asChild variant="outline" className="w-full h-12 rounded-xl font-bold border-2 max-w-xs transition-colors hover:bg-primary/5 hover:text-primary hover:border-primary/20">
                    <Link href="/mfa/setup" className="w-full">
                      Configurar Authenticator
                    </Link>
                  </Button>
                </div>
              )}
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
                    onChange={(e) => setPinValue(e.target.value.replaceAll(/\D/g, ""))}
                    required
                  />
                </div>
                <Button type="submit" className="w-full font-bold h-12 rounded-xl shadow-sm mt-2" disabled={settingPin}>
                  {settingPin ? (
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  ) : (() => {
                    const buttonText = user?.hasPin ? "Actualizar PIN" : "Guardar PIN";
                    return buttonText;
                  })()}
                </Button>
              </form>
            </div>
          </section>

          {/* Role Management */}
          <section>
            <SectionHeader title="Solicitud de roles" subtitle="Solicita tu alta como proveedor o repartidor desde tu cuenta actual." />
            <div className="mt-6 rounded-2xl border border-border/80 bg-card p-6 sm:p-8 shadow-sm">
              {availableRoles.length === 0 ? (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/5 border border-primary/20 text-primary">
                  <CheckCircle2 className="h-5 w-5" />
                  <p className="text-sm font-bold">Ya dispones de todos los roles solicitables en la plataforma.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
                    <p className="font-semibold text-foreground">Flujo real de solicitud</p>
                    <p className="mt-1">
                      El alta pública crea solo cuentas cliente. Desde aquí puedes solicitar un rol adicional usando tu cuenta autenticada.
                    </p>
                    <p className="mt-2">
                      El backend solo admite identificadores fiscales españoles y, si tienes MFA activado, debes haber completado la verificación de esta sesión.
                    </p>
                  </div>

                  <form onSubmit={handleRoleRequest} className="grid gap-5 sm:max-w-xl">
                    <div className="space-y-2">
                      <Label htmlFor="requested-role" className="text-sm font-semibold text-muted-foreground">
                        Rol solicitado
                      </Label>
                      <select
                        id="requested-role"
                        value={requestedRole}
                        onChange={(e) => setRequestedRole(e.target.value as "PROVIDER" | "RUNNER")}
                        className="h-12 rounded-xl border border-input bg-background px-4 text-sm"
                      >
                        {availableRoles.map((role) => (
                          <option key={role} value={role}>
                            {roleRequestLabel[role]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="requested-country" className="text-sm font-semibold text-muted-foreground">
                        País fiscal
                      </Label>
                      <select
                        id="requested-country"
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        className="h-12 rounded-xl border border-input bg-background px-4 text-sm"
                      >
                        <option value="ES">España (ES)</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="requested-fiscal-id" className="text-sm font-semibold text-muted-foreground">
                        Identificador fiscal
                      </Label>
                      <Input
                        id="requested-fiscal-id"
                        value={fiscalId}
                        onChange={(e) => setFiscalId(e.target.value)}
                        placeholder="NIF, NIE o CIF"
                        className="h-12 rounded-xl"
                        autoCapitalize="characters"
                        required
                      />
                      <p className="text-xs text-muted-foreground">
                        Introduce un NIF, NIE o CIF válido. El backend validará el formato y almacenará solo su huella y metadatos mínimos.
                      </p>
                    </div>

                    <Button
                      type="submit"
                      variant="outline"
                      className="h-12 px-6 rounded-xl font-bold border-2 max-w-sm transition-colors hover:bg-primary/5 hover:text-primary hover:border-primary/20"
                      disabled={requestingRole || !canRequestRole}
                    >
                      {requestingRole ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Enviando solicitud...
                        </>
                      ) : roleRequestLabel[requestedRole]}
                    </Button>
                  </form>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  )
}
