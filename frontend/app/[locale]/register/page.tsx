"use client"

import React, { useState } from "react"
import { useRouter } from "@/lib/navigation"
import { useAuth } from "@/contexts/auth-context"
import { toast } from "sonner"
import { Link } from "@/lib/navigation"
import { ArrowLeft, ArrowRight, Eye, EyeOff, Lock, Mail, User as UserIcon, CheckCircle2, ShieldCheck } from "lucide-react"

export default function RegisterPage() {
  const { register } = useAuth()
  const router = useRouter()

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState("CLIENT")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const [num1] = useState(Math.floor(Math.random() * 10) + 1)
  const [num2] = useState(Math.floor(Math.random() * 10) + 1)
  const [captchaAnswer, setCaptchaAnswer] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    if (parseInt(captchaAnswer) !== num1 + num2) {
      toast.error("Validación de seguridad (CAPTCHA) incorrecta. Inténtalo de nuevo.")
      setLoading(false)
      return
    }

    if (password.length < 12) {
      toast.error("Debes utilizar una contraseña fuerte de al menos 12 caracteres (Normativa ASVS 5.0).")
      setLoading(false)
      return
    }

    try {
      await register({ name, email, password, role })
      toast.success("Cuenta creada. Revisa tu correo electrónico para validarla.", { icon: "🌿" })
      setIsSuccess(true)
    } catch (error: any) {
      toast.error(error.message || "Error: No se pudo crear la cuenta con los datos proporcionados.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-[#fbf6ee] dark:bg-[#201512] flex min-h-screen text-slate-900 dark:text-slate-100 overflow-hidden font-display">
      {/* Left Column: Registration Form */}
      <div className="w-full lg:w-1/2 flex flex-col justify-between p-8 lg:p-16 xl:p-24 bg-[#FBF6EE] dark:bg-background-dark transition-colors duration-300 relative z-10 overflow-y-auto">
        <header className="flex items-center gap-3 mb-10 lg:mb-0">
          <button onClick={() => router.back()} className="text-[#e07d61] p-1 -ml-1 hover:bg-[#e07d61]/10 rounded-full transition-colors lg:hidden">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="text-[#e07d61] hidden lg:block">
            <svg className="size-8" fill="currentColor" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
              <path clipRule="evenodd" d="M24 4H6V17.3333V30.6667H24V44H42V30.6667V17.3333H24V4Z" fillRule="evenodd"></path>
            </svg>
          </div>
          <h1 className="font-serif text-2xl font-semibold tracking-tight">Mecerka</h1>
        </header>

        <div className="max-w-md w-full mx-auto my-auto py-8">
          {!isSuccess ? (
            <>
              <div className="mb-10 text-center lg:text-left">
                <h2 className="font-serif text-4xl lg:text-5xl mb-4 italic">Create an Account</h2>
                <p className="text-slate-600 dark:text-slate-400 font-light leading-relaxed">
                  Discover premium artisanal treasures curated from around the world.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2 mb-4">
                  <label className="text-slate-800 dark:text-slate-200 text-sm font-medium ml-1">¿Cómo deseas unirte a Mecerka?</label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {['CLIENT', 'PROVIDER', 'RUNNER'].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRole(r)}
                        className={`h-12 border rounded-lg text-sm font-medium transition-all ${role === r
                          ? "border-[#e07d61] bg-[#e07d61]/10 text-[#e07d61] shadow-sm"
                          : "border-[#e07d61]/20 bg-white dark:bg-[#201512]/50 text-slate-600 dark:text-slate-400 hover:border-[#e07d61]/50"
                          }`}
                      >
                        {r === 'CLIENT' ? 'Soy Cliente' : r === 'PROVIDER' ? 'Soy Artesano' : 'Repartidor'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-slate-800 dark:text-slate-200 text-sm font-medium ml-1">Full Name</label>
                  <div className="relative">
                    <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 lg:hidden" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      placeholder="Sofia Alva"
                      className="w-full h-14 pl-12 lg:pl-4 pr-4 bg-white dark:bg-[#201512]/50 border border-[#e07d61]/20 rounded-lg focus:ring-2 focus:ring-[#e07d61] focus:border-transparent transition-all outline-none text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-slate-800 dark:text-slate-200 text-sm font-medium ml-1">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 lg:hidden" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="hello@example.com"
                      className="w-full h-14 pl-12 lg:pl-4 pr-4 bg-white dark:bg-[#201512]/50 border border-[#e07d61]/20 rounded-lg focus:ring-2 focus:ring-[#e07d61] focus:border-transparent transition-all outline-none text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-slate-800 dark:text-slate-200 text-sm font-medium ml-1">Password (Min 12 Chars)</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 lg:hidden" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      placeholder="••••••••••••"
                      className="w-full h-14 pl-12 lg:pl-4 pr-12 bg-white dark:bg-[#201512]/50 border border-[#e07d61]/20 rounded-lg focus:ring-2 focus:ring-[#e07d61] focus:border-transparent transition-all outline-none text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#e07d61] transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-border/50">
                  <label className="text-slate-800 dark:text-slate-200 text-sm font-medium ml-1 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-[#e07d61]" /> Confirmación de Seguridad (CAPTCHA)
                  </label>
                  <div className="flex items-center gap-3">
                    <div className="h-14 px-4 bg-muted/50 border border-border rounded-lg flex items-center justify-center font-bold text-lg text-slate-700 dark:text-slate-300 pointer-events-none select-none">
                      {num1} + {num2} = ?
                    </div>
                    <input
                      type="number"
                      value={captchaAnswer}
                      onChange={(e) => setCaptchaAnswer(e.target.value)}
                      required
                      placeholder="Resultado"
                      className="flex-1 h-14 px-4 bg-white dark:bg-[#201512]/50 border border-[#e07d61]/20 rounded-lg focus:ring-2 focus:ring-[#e07d61] transition-all outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 py-2">
                  <input type="checkbox" id="terms" required className="rounded border-[#e07d61]/30 text-[#e07d61] focus:ring-[#e07d61]" />
                  <label htmlFor="terms" className="text-sm text-slate-600 dark:text-slate-400">
                    I agree to the <Link href="#" className="text-[#e07d61] hover:underline">Terms of Service</Link> and <Link href="#" className="text-[#e07d61] hover:underline">Privacy Policy</Link>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-14 bg-[#e07d61] hover:bg-[#e07d61]/90 text-white font-bold rounded-lg shadow-lg shadow-[#e07d61]/20 transition-all flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  {loading ? "Registrando..." : "Create Account"}
                  {!loading && <ArrowRight className="w-5 h-5" />}
                </button>
              </form>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center text-center py-10 animate-in fade-in zoom-in duration-500">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
                <CheckCircle2 className="w-10 h-10 text-green-600" />
              </div>
              <h2 className="font-serif text-3xl font-bold mb-4 text-slate-900 dark:text-white">¡Revisa tu bandeja de entrada!</h2>
              <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-[280px] mx-auto leading-relaxed">
                Hemos enviado un correo a <span className="font-medium text-slate-900 dark:text-white">{email}</span> con un enlace para confirmar tu identidad.
              </p>
              <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg mb-8 text-sm text-orange-800">
                Debes validar tu correo para poder iniciar sesión en Mecerka.
              </div>
              <Link
                href="/login"
                className="w-full h-14 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold rounded-lg hover:shadow-lg transition-all flex items-center justify-center"
              >
                Ir a Iniciar Sesión
              </Link>
            </div>
          )}

          {!isSuccess && (
            <div className="mt-8 pt-8 border-t border-[#e07d61]/10 flex flex-col gap-4 text-center">
              <p className="text-slate-600 dark:text-slate-400 text-sm">
                Already have an account? <Link href="/login" className="text-[#e07d61] font-bold hover:underline">Log In</Link>
              </p>
            </div>
          )}
        </div>

        <footer className="mt-auto pt-10 text-slate-400 text-xs text-center lg:text-left">
          © {new Date().getFullYear()} Mecerka Artisanal Shop. All rights reserved.
        </footer>
      </div>

      {/* Right Column: Editorial Visuals */}
      <div className="hidden lg:block lg:w-1/2 relative bg-black">
        <div
          className="absolute inset-0 bg-cover bg-center transition-transform duration-1000 hover:scale-[1.02] opacity-90"
          style={{ backgroundImage: `url('https://images.unsplash.com/photo-1606041008023-472dfb5e530f?q=80')` }}
        >
          <div className="absolute inset-0 bg-[#e07d61]/10 mix-blend-multiply"></div>
        </div>

        <div className="absolute bottom-20 left-12 right-12 text-white">
          <div className="p-8 backdrop-blur-md bg-black/20 border border-white/20 rounded-xl">
            <span className="material-symbols-outlined text-[#e07d61] mb-4 text-3xl">format_quote</span>
            <p className="font-serif text-3xl italic leading-relaxed mb-6">"Our mission is to preserve the soul of craftsmanship by connecting you directly with the world's most talented artisans."</p>
            <div className="flex items-center gap-3">
              <div className="w-10 h-px bg-white/50"></div>
              <span className="uppercase tracking-widest text-xs font-semibold">The Founders, Mecerka</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
