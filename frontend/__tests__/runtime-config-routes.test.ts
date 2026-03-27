import { describe, expect, it, vi } from "vitest"

const payload = {
  apiBaseUrl: "/api",
  stripePublishableKey: "pk_test_demo",
  requireMfa: false,
}

vi.mock("@/lib/public-runtime-config", () => ({
  getPublicRuntimeConfigPayload: () => payload,
}))

describe("runtime-config routes", () => {
  it("serves the root runtime config payload", async () => {
    const { GET, dynamic, revalidate } = await import("@/app/runtime-config/route")
    const response = await GET()

    expect(dynamic).toBe("force-dynamic")
    expect(revalidate).toBe(0)
    await expect(response.json()).resolves.toEqual(payload)
  })

  it("serves the localized runtime config payload", async () => {
    const { GET, dynamic, revalidate } = await import("@/app/[locale]/runtime-config/route")
    const response = await GET()

    expect(dynamic).toBe("force-dynamic")
    expect(revalidate).toBe(0)
    await expect(response.json()).resolves.toEqual(payload)
  })
})
