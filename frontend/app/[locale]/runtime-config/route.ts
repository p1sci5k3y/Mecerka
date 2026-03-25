import { NextResponse } from "next/server"
import { getPublicRuntimeConfigPayload } from "@/lib/public-runtime-config"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET() {
  return NextResponse.json(getPublicRuntimeConfigPayload())
}
