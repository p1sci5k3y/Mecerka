"use client"



import { useEffect } from "react"
import { useRouter, usePathname } from "@/lib/navigation"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import type { Role } from "@/lib/types"

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
      router.replace("/dashboard")
      return;
    }

    if (!isLoading && isAuthenticated && user && !user.mfaEnabled) {
      // Allow access to setup page if MFA not enabled
      if (pathname !== '/mfa/setup') {
        router.replace("/mfa/setup")
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
