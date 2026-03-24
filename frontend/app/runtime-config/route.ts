import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET() {
  return NextResponse.json({
    apiBaseUrl: "/api",
    stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
    requireMfa: process.env.NEXT_PUBLIC_REQUIRE_MFA !== "false",
  })
}
