"use client"

import { useEffect } from "react"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { ProtectedRoute } from "@/components/protected-route"
import { useAuth } from "@/contexts/auth-context"
import { ClientDashboard } from "./client-dashboard"
import { Loader2 } from "lucide-react"
import { useRouter } from "@/lib/navigation"
import { getPrimaryRouteForUser } from "@/lib/role-navigation"

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  )
}

function DashboardContent() {
  const { user } = useAuth()
  const router = useRouter()
  const primaryRoute = getPrimaryRouteForUser(user)

  useEffect(() => {
    if (user && primaryRoute !== "/dashboard") {
      router.replace(primaryRoute)
    }
  }, [primaryRoute, router, user])

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col bg-background selection:bg-primary/20">
        <Navbar />
        <main className="flex-1 flex items-center justify-center py-20 bg-[#FBF6EE] dark:bg-[#140D0B] transition-colors">
          <Loader2 className="h-8 w-8 animate-spin text-[#df795d]" />
        </main>
        <Footer />
      </div>
    )
  }

  if (primaryRoute !== "/dashboard") {
    return (
      <div className="flex min-h-screen flex-col bg-background selection:bg-[#df795d]/20">
        <Navbar />
        <main className="flex-1 flex items-center justify-center py-20 bg-[#FBF6EE] dark:bg-[#140D0B] transition-colors">
          <Loader2 className="h-8 w-8 animate-spin text-[#df795d]" />
        </main>
        <Footer />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background selection:bg-[#df795d]/20">
      <Navbar />
      <main className="flex-1 px-6 md:px-10 lg:px-40 py-8 md:py-16 bg-[#FBF6EE] dark:bg-[#140D0B] transition-colors">
        <div className="mx-auto max-w-7xl w-full">
          <ClientDashboard />
        </div>
      </main>
      <Footer />
    </div>
  )
}
