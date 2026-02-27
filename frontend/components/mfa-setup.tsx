"use client"

import { useState } from "react"
import Image from "next/image"
import { Shield, ShieldCheck, ShieldOff, Loader2, Copy, CheckCircle2 } from "lucide-react"
import { mfaService, type MfaStatus } from "@/lib/services/mfa-service"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"

export function MfaSetup() {
  const [status, setStatus] = useState<MfaStatus>("disabled")
  const [loading, setLoading] = useState(false)
  const [qrUrl, setQrUrl] = useState("")
  const [secret, setSecret] = useState("")
  const [code, setCode] = useState("")
  const [copied, setCopied] = useState(false)

  const handleEnable = async () => {
    setLoading(true)
    try {
      const result = await mfaService.enable()
      setQrUrl(result.qrCode) // Use the Data URL directly
      setSecret(result.secret)
      setStatus("pending")
    } catch {
      toast.error("Error al iniciar configuración MFA")
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async () => {
    if (code.length !== 6) {
      toast.error("El código debe tener 6 dígitos")
      return
    }
    try {
      const result = await mfaService.verify(code)
      if (result.success) {
        setStatus("enabled")
        toast.success("MFA activado correctamente")
      }
    } catch {
      toast.error("Código inválido")
    } finally {
      setLoading(false)
    }
  }

  const handleDisable = async () => {
    setLoading(true)
    await mfaService.disable()
    setStatus("disabled")
    setQrUrl("")
    setSecret("")
    setCode("")
    setLoading(false)
    toast.info("MFA desactivado (mock)")
  }

  const copySecret = () => {
    navigator.clipboard.writeText(secret)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (status === "disabled") {
    return (
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldOff className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">MFA desactivado</p>
            <p className="text-xs text-muted-foreground">
              Añade una capa extra de seguridad a tu cuenta
            </p>
          </div>
        </div>
        <Button size="sm" onClick={handleEnable} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Activar MFA"}
        </Button>
      </div>
    )
  }

  if (status === "pending") {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <Shield className="h-5 w-5 text-primary" />
          <p className="text-sm font-medium text-foreground">
            Configura tu aplicación de autenticación
          </p>
        </div>

        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          {/* QR Code */}
          <div className="flex-shrink-0 rounded-lg border border-border bg-background p-2">
            {qrUrl ? (
              <Image
                src={qrUrl}
                alt="Código QR para MFA"
                width={160}
                height={160}
                className="rounded"
                unoptimized
              />
            ) : (
              <div className="h-[160px] w-[160px] animate-pulse bg-muted" />
            )}
          </div>

          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Escanea el código QR con tu aplicación de autenticación (Google Authenticator, Authy, etc.)
            </p>
            <div className="flex items-center gap-2">
              <code className="rounded bg-secondary px-2.5 py-1 text-xs font-mono text-foreground">
                {secret}
              </code>
              <button
                type="button"
                onClick={copySecret}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Copiar secreto"
              >
                {copied ? (
                  <CheckCircle2 className="h-4 w-4 text-accent" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <Input
                placeholder="Código de 6 dígitos"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="w-40"
                maxLength={6}
              />
              <Button size="sm" onClick={handleVerify} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verificar"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Enabled
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-5 w-5 text-accent" />
        <div>
          <p className="text-sm font-medium text-foreground">MFA activado</p>
          <p className="text-xs text-muted-foreground">
            Tu cuenta tiene una capa adicional de seguridad
          </p>
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={handleDisable} disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Desactivar"}
      </Button>
    </div>
  )
}
