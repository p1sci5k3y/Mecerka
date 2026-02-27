"use client"

import React, { useState, useRef } from "react"
import { useRouter } from "@/lib/navigation"
import { useAuth } from "@/contexts/auth-context"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { Link } from "@/lib/navigation"
import { ArrowLeft, ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react"

export default function LoginPage() {
  const { login, mutate } = useAuth()
  const router = useRouter()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  // MFA Step
  const [step, setStep] = useState<1 | 2>(1)
  const [otp, setOtp] = useState(["", "", "", "", "", ""])
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])

  const handleFocusNext = (index: number) => {
    if (index < 5 && otpRefs.current[index + 1]) {
      otpRefs.current[index + 1]?.focus()
    }
  }

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) return // Prevent multiple chars
    const newOtp = [...otp]
    newOtp[index] = value
    setOtp(newOtp)
    if (value) handleFocusNext(index)
  }

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus()
    }
  }

  const proceedToVerify = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setLoading(true)
    try {
      await login({ email, password })
      setStep(2)
    } catch (error: any) {
      toast.error(error.message || "Credenciales inválidas.")
    } finally {
      setLoading(false)
    }
  }

  const completeLogin = async () => {
    const token = otp.join("")
    if (token.length < 6) {
      toast.error("Por favor, introduce el código de 6 dígitos.")
      return
    }

    setLoading(true)
    try {
      await api.post('/auth/mfa/verify', { token })
      await mutate?.() // Refresca el usuario en el contexto
      toast.success("Bienvenido a Mecerka", { icon: "🌿" })
      router.push("/dashboard")
    } catch (error: any) {
      toast.error("Código incorrecto.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-[#f8f6f6] dark:bg-[#201512] flex min-h-screen text-slate-900 dark:text-slate-100 overflow-hidden">
      {/* Left Column: Login Form */}
      <div className="w-full lg:w-1/2 flex flex-col justify-between p-8 lg:p-16 xl:p-24 bg-[#FBF6EE] dark:bg-background-dark transition-colors duration-300 relative z-10 overflow-y-auto">
        <header className="flex items-center gap-3 mb-10 lg:mb-0">
          <button onClick={() => router.back()} className="text-[#e07b61] p-1 -ml-1 hover:bg-[#e07b61]/10 rounded-full transition-colors lg:hidden">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="text-[#e07b61] hidden lg:block">
            <span className="material-symbols-outlined text-4xl">grid_view</span>
          </div>
          <h1 className="font-serif text-2xl font-semibold tracking-tight">Mecerka</h1>
        </header>

        <div className="max-w-md w-full mx-auto my-auto py-8">
          <div className="mb-10 text-center lg:text-left">
            <h2 className="font-serif text-4xl lg:text-5xl mb-4 italic">Welcome back</h2>
            <p className="text-slate-600 dark:text-slate-400 font-light leading-relaxed">
              Sign in to access your curated collection of handmade treasures and connect with master artisans.
            </p>
          </div>

          {step === 1 ? (
            <form onSubmit={proceedToVerify} className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-widest font-semibold text-slate-500" htmlFor="email">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-0 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 lg:hidden" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="artisanal@mercadovivo.com"
                    className="w-full bg-transparent border-0 border-b border-slate-300 dark:border-slate-700 focus:ring-0 focus:border-[#e07b61] pl-8 lg:pl-0 py-3 text-lg font-light transition-all placeholder:text-slate-400 outline-none"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs uppercase tracking-widest font-semibold text-slate-500" htmlFor="password">Password</label>
                  <Link href="#" className="text-xs uppercase tracking-widest font-semibold text-[#e07b61] hover:opacity-80 transition-opacity">Forgot?</Link>
                </div>
                <div className="relative">
                  <Lock className="absolute left-0 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 lg:hidden" />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="w-full bg-transparent border-0 border-b border-slate-300 dark:border-slate-700 focus:ring-0 focus:border-[#e07b61] pl-8 lg:pl-0 pr-10 py-3 text-lg font-light transition-all placeholder:text-slate-400 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#e07b61] transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div className="pt-6">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#e07b61] text-white py-4 rounded-lg font-medium tracking-wide hover:shadow-lg hover:shadow-[#e07b61]/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  {loading ? "Verificando..." : "Sign In to Mercado"}
                  {!loading && <ArrowRight className="w-5 h-5" />}
                </button>
              </div>
            </form>
          ) : (
            <div className="flex flex-col items-center justify-center animate-in fade-in slide-in-from-right-4 duration-500">
              <div className="w-16 h-16 bg-[#e07b61]/10 rounded-full flex items-center justify-center mb-6">
                <Lock className="w-8 h-8 text-[#e07b61]" />
              </div>
              <h3 className="font-serif text-2xl font-bold text-center mb-2">Completar Acceso</h3>
              <p className="text-center text-slate-600 dark:text-slate-400 mb-8 max-w-[280px]">
                Introduce los 6 dígitos generados por tu aplicación Authenticator.
              </p>

              <div className="flex gap-2 sm:gap-4 mb-8">
                {otp.map((digit, index) => (
                  <input
                    key={`otp-${index}`}
                    ref={(el) => { otpRefs.current[index] = el }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(index, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(index, e)}
                    className="w-10 h-12 sm:w-12 sm:h-14 font-mono text-xl sm:text-2xl text-center rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-[#e07b61] focus:border-transparent outline-none transition-all"
                  />
                ))}
              </div>

              <button
                onClick={completeLogin}
                disabled={loading || otp.join("").length < 6}
                className="w-full bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold py-4 rounded-xl hover:shadow-lg shadow-slate-900/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? "Validando..." : "Verificar e Ingresar"}
              </button>

              <button onClick={() => setStep(1)} className="mt-4 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-slate-300 transition-colors">
                Volver
              </button>
            </div>
          )}

          {step === 1 && (
            <>
              <div className="flex items-center gap-4 py-8">
                <div className="h-px bg-slate-200 dark:bg-slate-800 flex-1"></div>
                <span className="text-xs text-slate-400 uppercase tracking-tighter">or continue with</span>
                <div className="h-px bg-slate-200 dark:bg-slate-800 flex-1"></div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button type="button" className="flex items-center justify-center gap-2 border border-slate-200 dark:border-slate-800 py-3 rounded-lg hover:bg-white dark:hover:bg-slate-800 transition-colors">
                  <img src="https://lh3.googleusercontent.com/aida-public/AB6AXuB2E0Yr4ov3sNptO8UviwDYcHJHiIrFmPbG-1r5o1fA2GIvadZIQB5PvvJY9CGOfEsQ_JUyQ4A0jf-2bx4B0RfSJH59ypks2e6lJXzQR4LKeJSttcaSodODvgXCpnyJ6SHUuX09AUrUlFnckQkuGUy0rEdtmguxfRA7kcXVWMfbMmZcC-i8VACnH4IEZsHTnYP4O8vMw7wjHNOp0O0yyNVAsVB316ewL17RDDy-WtD1ajGZXThzkUAb3TlkjXV-z5Xz7cufs04tKW8" alt="Google" className="w-5 h-5" />
                  <span className="text-sm font-medium">Google</span>
                </button>
                <button type="button" className="flex items-center justify-center gap-2 border border-slate-200 dark:border-slate-800 py-3 rounded-lg hover:bg-white dark:hover:bg-slate-800 transition-colors">
                  <img src="https://lh3.googleusercontent.com/aida-public/AB6AXuAxRCC68Vav1jmjFbubjb8KlpTBpqwfdOHhDSiDPEgvAvour5UNi8g5-BDU2DvErVTx44Id-Cpzpb20umcVh4UH4pRU_tuKieLVjJ5UvZwef5lEZDA-4tEtx1g-nwDCnT80lYCX30__r8rgvUcobgthFoV8haaXXfKpohWO6EOL_X8kELfEtRBbuAVmlpZxc1jWwIfkoFtOIA2HmV_sR3ui47EVyBraCSUl6eNNnzArj5xGgQA-q5djrDSnaCfGTb_l8wluti2NIPc" alt="Apple" className="w-5 h-5" />
                  <span className="text-sm font-medium">Apple</span>
                </button>
              </div>

              <p className="mt-12 text-center text-sm text-slate-500">
                New to our marketplace?{" "}
                <Link href="/register" className="text-[#e07b61] font-semibold hover:underline underline-offset-4">Create an account</Link>
              </p>
            </>
          )}
        </div>

        {/* Footer Links (hidden on small mobile to save space) */}
        <div className="hidden sm:flex flex-wrap justify-center lg:justify-start gap-6 text-[10px] uppercase tracking-[0.2em] text-slate-400 mt-8">
          <Link href="#" className="hover:text-[#e07b61] transition-colors">Sustainability</Link>
          <Link href="#" className="hover:text-[#e07b61] transition-colors">Privacy</Link>
          <Link href="#" className="hover:text-[#e07b61] transition-colors">Terms</Link>
          <Link href="#" className="hover:text-[#e07b61] transition-colors">Journal</Link>
        </div>
      </div>

      {/* Right Column: Visual Inspiration */}
      <div className="hidden lg:block lg:w-1/2 relative bg-black">
        <div
          className="absolute inset-0 bg-cover bg-center brightness-90 transition-transform duration-1000 hover:scale-[1.02]"
          style={{ backgroundImage: `url('https://images.unsplash.com/photo-1610701596007-11502861dcfa?q=80')` }}
        ></div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20"></div>

        <div className="absolute bottom-12 left-12 right-12 text-white p-8 backdrop-blur-md bg-white/10 rounded-xl border border-white/20">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-px w-8 bg-[#e07b61]"></div>
            <span className="text-xs uppercase tracking-[0.3em] font-light">Featured Artisan</span>
          </div>
          <h3 className="font-serif text-3xl mb-2">Elena Rossi</h3>
          <p className="font-light text-slate-200 italic">"Every piece of pottery tells a story of the earth it came from and the hands that shaped its destiny."</p>
          <div className="mt-6 flex gap-4">
            <div className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[#e07b61] text-sm">location_on</span>
              <span className="text-xs font-light tracking-widest uppercase">Florence, Italy</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
