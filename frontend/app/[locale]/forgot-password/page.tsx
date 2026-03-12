"use client"

import React, { useState } from "react"
import { useRouter, Link } from "@/lib/navigation"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { ArrowLeft, ArrowRight, Mail } from "lucide-react"
import { useTranslations } from 'next-intl'
import { BrandMark, BrandWordmark } from "@/components/brand-mark"

export default function ForgotPasswordPage() {
    const t = useTranslations('Auth')
    const router = useRouter()

    const [email, setEmail] = useState("")
    const [loading, setLoading] = useState(false)
    const [success, setSuccess] = useState(false)

    const handleForgotSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        try {
            await api.post('/auth/forgot-password', { email })
            setSuccess(true)
            toast.success(t('forgotSuccessTitle'))
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : t('forgotErrorMessage')
            toast.error(message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="bg-[#f8f6f6] dark:bg-[#201512] flex min-h-screen text-slate-900 dark:text-slate-100 overflow-hidden">
            {/* Left Column: Form */}
            <div className="w-full lg:w-1/2 flex flex-col justify-between p-8 lg:p-16 xl:p-24 bg-[#FBF6EE] dark:bg-background-dark transition-colors duration-300 relative z-10 overflow-y-auto">
                <header className="flex items-center gap-3 mb-10 lg:mb-0">
                    <button onClick={() => router.back()} className="text-[#e07b61] p-1 -ml-1 hover:bg-[#e07b61]/10 rounded-full transition-colors lg:hidden">
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                    <Link href="/" className="flex items-center gap-2 group">
                        <BrandMark className="text-[#e07b61] group-hover:opacity-80 transition-opacity" size={32} />
                        <BrandWordmark className="text-2xl font-serif" />
                    </Link>
                </header>

                <div className="max-w-md w-full mx-auto my-auto py-8">
                    {success ? (
                        <div className="flex flex-col items-center justify-center animate-in fade-in slide-in-from-right-4 duration-500">
                            <div className="w-16 h-16 bg-[#e07b61]/10 rounded-full flex items-center justify-center mb-6">
                                <Mail className="w-8 h-8 text-[#e07b61]" />
                            </div>
                            <h3 className="font-serif text-2xl font-bold text-center mb-2">{t('forgotSuccessTitle')}</h3>
                            <p className="text-center text-slate-600 dark:text-slate-400 mb-8 max-w-[280px]">
                                {t('forgotSuccessSubtitle')}
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="mb-10 text-center lg:text-left">
                                <h2 className="font-serif text-4xl lg:text-5xl mb-4 italic">{t('forgotTitle')}</h2>
                                <p className="text-slate-600 dark:text-slate-400 font-light leading-relaxed">
                                    {t('forgotSubtitle')}
                                </p>
                            </div>

                            <form onSubmit={handleForgotSubmit} className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-xs uppercase tracking-widest font-semibold text-slate-500" htmlFor="email">{t('emailLabel')}</label>
                                    <div className="relative">
                                        <Mail className="absolute left-0 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 lg:hidden" />
                                        <input
                                            id="email"
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            required
                                            placeholder={t('emailPlaceholder')}
                                            className="w-full bg-transparent border-0 border-b border-slate-300 dark:border-slate-700 focus:ring-0 focus:border-[#e07b61] pl-8 lg:pl-0 py-3 text-lg font-light transition-all placeholder:text-slate-400 outline-none"
                                        />
                                    </div>
                                </div>

                                <div className="pt-6">
                                    <button
                                        type="submit"
                                        disabled={loading || !email}
                                        className="w-full bg-[#e07b61] text-white py-4 rounded-lg font-medium tracking-wide hover:shadow-lg hover:shadow-[#e07b61]/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-70"
                                    >
                                        {loading ? t('sendingButton') : t('forgotButton')}
                                        {!loading && <ArrowRight className="w-5 h-5" />}
                                    </button>
                                </div>
                            </form>
                        </>
                    )}

                    <div className="flex items-center gap-4 py-8">
                        <div className="h-px bg-slate-200 dark:bg-slate-800 flex-1"></div>
                    </div>

                    <div className="text-center">
                        <Link href="/login" className="text-sm font-medium text-slate-600 hover:text-[#e07b61] dark:text-slate-400 dark:hover:text-[#e07b61] transition-colors">
                            {t('backToLogin')}
                        </Link>
                    </div>
                </div>

                {/* Footer hidden for mobile to save space, visible on large screens */}
                <footer className="hidden lg:block text-slate-500 text-sm">
                    {t('footerText', { year: new Date().getFullYear() })}
                </footer>
            </div>

            {/* Right Column: Decorative */}
            <div className="hidden lg:flex w-1/2 relative bg-[#F4EDE4] dark:bg-[#2A1F1A] items-center justify-center overflow-hidden">
                <div className="absolute inset-0 opacity-10 dark:opacity-5 mix-blend-multiply dark:mix-blend-screen"
                    style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #e07b61 1px, transparent 0)', backgroundSize: '32px 32px' }}>
                </div>
            </div>
        </div>
    )
}
