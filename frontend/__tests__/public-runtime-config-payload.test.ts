import { afterEach, describe, expect, it } from "vitest"
import { getPublicRuntimeConfigPayload } from "@/lib/public-runtime-config"

const originalStripeKey = process.env.STRIPE_PUBLISHABLE_KEY
const originalRequireMfa = process.env.NEXT_PUBLIC_REQUIRE_MFA

describe("getPublicRuntimeConfigPayload", () => {
  afterEach(() => {
    process.env.STRIPE_PUBLISHABLE_KEY = originalStripeKey
    process.env.NEXT_PUBLIC_REQUIRE_MFA = originalRequireMfa
  })

  it("returns the public runtime defaults", () => {
    delete process.env.STRIPE_PUBLISHABLE_KEY
    delete process.env.NEXT_PUBLIC_REQUIRE_MFA

    expect(getPublicRuntimeConfigPayload()).toEqual({
      apiBaseUrl: "/api",
      stripePublishableKey: null,
      requireMfa: true,
    })
  })

  it("uses the configured publishable key and allows disabling MFA", () => {
    process.env.STRIPE_PUBLISHABLE_KEY = "pk_test_demo"
    process.env.NEXT_PUBLIC_REQUIRE_MFA = "false"

    expect(getPublicRuntimeConfigPayload()).toEqual({
      apiBaseUrl: "/api",
      stripePublishableKey: "pk_test_demo",
      requireMfa: false,
    })
  })
})
