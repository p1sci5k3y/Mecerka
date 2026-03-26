"use client"

import React from "react"
import { useParams } from "next/navigation"

import dynamic from "next/dynamic"
import { useAuth } from "@/contexts/auth-context"
import { Navbar } from "@/components/navbar"
import { ProtectedRoute } from "@/components/protected-route"

const DynamicDeliveryMap = dynamic(() => import('@/components/tracking/DynamicDeliveryMap'), {
    ssr: false,
    loading: () => <div className="h-[400px] w-full animate-pulse bg-muted rounded-xl" />
});

export default function TrackOrderPage() {
    const params = useParams()
    const { user } = useAuth()
    const orderId =
        typeof params.id === "string"
            ? params.id
            : Array.isArray(params.id)
              ? params.id[0] || ""
              : ""

    const isRunner = user?.roles?.includes("RUNNER")

    return (
        <ProtectedRoute allowedRoles={["CLIENT", "PROVIDER", "RUNNER", "ADMIN"]}>
            <div className="flex min-h-screen flex-col">
                <Navbar />
                <main className="flex-1 container mx-auto px-4 py-8">
                    <h1 className="text-2xl font-bold mb-6">Seguimiento del Pedido #{orderId}</h1>

                    <div className="rounded-xl border border-border overflow-hidden h-[500px]">
                        <DynamicDeliveryMap
                            orderId={orderId}
                            initialLat={40.4168}
                            initialLng={-3.7038}
                            isRunner={isRunner}
                        />
                    </div>
                </main>
            </div>
        </ProtectedRoute>
    )
}
