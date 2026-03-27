"use client"

import { usePathname, useRouter, Link } from "@/lib/navigation" // Localized navigation
import {
  User,
  Package,
  LogOut,
  LayoutDashboard,
  Menu,
  X,
  Languages,
  Truck,
  ShoppingCart,
} from "lucide-react"
import { useState, useTransition } from "react"
import { useAuth } from "@/contexts/auth-context"
import { useCart } from "@/contexts/cart-context"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { useTranslations, useLocale } from "next-intl"
import { BrandMark, BrandWordmark } from "@/components/brand-mark"
import { getPrimaryRouteForUser } from "@/lib/role-navigation"

const publicLinks = [
  { href: "/products", label: "catalog" }, // labelKey
]

export function Navbar() {
  const t = useTranslations('Navbar')
  const locale = useLocale()
  const { user, isAuthenticated, logout } = useAuth()
  const { totalItems } = useCart()
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const dashboardLink = getPrimaryRouteForUser(user)
  const canUseCart = !isAuthenticated || user?.roles?.includes("CLIENT")

  const handleLanguageChange = (newLocale: string) => {
    startTransition(() => {
      router.replace(pathname, { locale: newLocale })
    })
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 lg:px-8">
        <Link
          href="/"
          className="flex items-center gap-2 group"
        >
          <BrandMark className="text-primary group-hover:text-accent transition-colors" size={28} />
          <BrandWordmark className="text-xl" />
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-1 md:flex">
          {publicLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-secondary",
                pathname === link.href
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground"
              )}
            >
              {t(link.label)}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-2 md:flex">
          {/* Language Switcher */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <Languages className="h-4 w-4" />
                <span className="sr-only">{t("switchLanguage")}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleLanguageChange('es')} disabled={locale === 'es'}>
                Español
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleLanguageChange('en')} disabled={locale === 'en'}>
                English
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {canUseCart && (
            <Link href="/cart" aria-label={t('cart')} className="block">
              <Button
                variant="ghost"
                size="icon"
                className="relative h-10 w-10 rounded-full"
              >
                <ShoppingCart className="h-5 w-5" />
                {totalItems > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-primary-foreground shadow-sm">
                    {totalItems}
                  </span>
                )}
              </Button>
            </Link>
          )}

          {isAuthenticated ? (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2">
                    <User className="h-4 w-4" />
                    <span className="max-w-[120px] truncate text-sm">
                      {user?.name || t("userFallback")}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem asChild>
                      <Link href={dashboardLink} className="flex items-center gap-2">
                      <LayoutDashboard className="h-4 w-4" />
                      {t('dashboard')}
                    </Link>
                  </DropdownMenuItem>
                  {user?.roles?.includes("PROVIDER") && (
                    <DropdownMenuItem asChild>
                      <Link href="/provider/products" className="flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        {t('inventory')}
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {user?.roles?.includes("RUNNER") && (
                    <DropdownMenuItem asChild>
                      <Link href="/runner" className="flex items-center gap-2">
                        <Truck className="h-4 w-4" />
                        {t("deliveries")}
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem asChild>
                    <Link href="/profile" className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      {t('profile')}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={logout}
                    className="flex items-center gap-2 text-destructive"
                  >
                    <LogOut className="h-4 w-4" />
                    {t('logout')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <Link href="/login">
                <Button variant="ghost" size="sm">
                  {t('login')}
                </Button>
              </Link>
              <Link href="/register">
                <Button size="sm">{t('register')}</Button>
              </Link>
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          className="md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={t("toggleMenu")}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="border-t border-border bg-background px-4 pb-4 md:hidden">
          <div className="flex flex-col gap-1 pt-2">
            {publicLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-secondary",
                  pathname === link.href
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground"
                )}
                onClick={() => setMobileOpen(false)}
              >
                {t(link.label)}
              </Link>
            ))}
            <div className="flex items-center gap-2 px-3 py-2">
              <Languages className="h-4 w-4 text-muted-foreground" />
              <button onClick={() => handleLanguageChange('es')} className={cn("text-sm", locale === 'es' ? "font-bold" : "text-muted-foreground")}>ES</button>
              <span className="text-muted-foreground">/</span>
              <button onClick={() => handleLanguageChange('en')} className={cn("text-sm", locale === 'en' ? "font-bold" : "text-muted-foreground")}>EN</button>
            </div>
            {canUseCart && (
              <Link
                href="/cart"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary"
                onClick={() => setMobileOpen(false)}
              >
                <ShoppingCart className="h-4 w-4" />
                <span>{t('cart')}</span>
                {totalItems > 0 && (
                  <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-primary-foreground">
                    {totalItems}
                  </span>
                )}
              </Link>
            )}
            {isAuthenticated ? (
              <>
                <Link
                  href={dashboardLink}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary"
                  onClick={() => setMobileOpen(false)}
                >
                  <LayoutDashboard className="h-4 w-4" />
                  {t('dashboard')}
                </Link>
                {user?.roles?.includes("PROVIDER") && (
                  <Link
                    href="/provider/products"
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary"
                    onClick={() => setMobileOpen(false)}
                  >
                    <Package className="h-4 w-4" />
                    {t('inventory')}
                  </Link>
                )}
                {user?.roles?.includes("RUNNER") && (
                  <Link
                    href="/runner"
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary"
                    onClick={() => setMobileOpen(false)}
                  >
                    <Truck className="h-4 w-4" />
                    {t("deliveries")}
                  </Link>
                )}
                <Link
                  href="/profile"
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary"
                  onClick={() => setMobileOpen(false)}
                >
                  <User className="h-4 w-4" />
                  {t('profile')}
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    logout()
                    setMobileOpen(false)
                  }}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-destructive hover:bg-secondary"
                >
                  <LogOut className="h-4 w-4" />
                  {t('logout')}
                </button>
              </>
            ) : (
              <div className="flex flex-col gap-2 pt-2">
                <Link href="/login" onClick={() => setMobileOpen(false)}>
                  <Button variant="outline" className="w-full bg-transparent">
                    {t('login')}
                  </Button>
                </Link>
                <Link href="/register" onClick={() => setMobileOpen(false)}>
                  <Button className="w-full">{t('register')}</Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
