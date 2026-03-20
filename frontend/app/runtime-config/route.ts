import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET() {
  return NextResponse.json({
    apiBaseUrl: process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || "/api",
    stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
    requireMfa: process.env.NEXT_PUBLIC_REQUIRE_MFA !== "false",
  })
}
