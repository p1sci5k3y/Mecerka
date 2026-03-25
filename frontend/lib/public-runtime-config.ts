export function getPublicRuntimeConfigPayload() {
  return {
    apiBaseUrl: "/api",
    stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
    requireMfa: process.env.NEXT_PUBLIC_REQUIRE_MFA !== "false",
  }
}
