"use client"



import { useEffect } from "react"
import { useRouter, usePathname } from "@/lib/navigation"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import type { Role } from "@/lib/types"
import { getPrimaryRouteForUser } from "@/lib/role-navigation"
import { getPublicRuntimeConfig } from "@/lib/runtime-config"

interface ProtectedRouteProps {
  children: React.ReactNode
  allowedRoles?: Role[]
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login")
    }
    if (
      !isLoading &&
      isAuthenticated &&
      allowedRoles &&
      user &&
      !allowedRoles.some(role => user?.roles?.includes(role))
    ) {
      router.replace(getPrimaryRouteForUser(user))
      return
    }

    if (!isLoading && isAuthenticated && user) {
      let active = true
      void getPublicRuntimeConfig().then((config) => {
        if (!active) return
        if (!user.mfaEnabled && config.requireMfa) {
          // Allow access to setup page if MFA not enabled
          if (pathname !== '/mfa/setup') {
            router.replace("/mfa/setup")
          }
        }
      })
      return () => {
        active = false
      }
    }
  }, [isLoading, isAuthenticated, user, allowedRoles, router, pathname])

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!isAuthenticated) return null

  if (allowedRoles && user && !allowedRoles.some(role => user?.roles?.includes(role))) {
    return null
  }

  return <>{children}</>
}
