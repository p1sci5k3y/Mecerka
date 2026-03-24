import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const originalLocation = globalThis.location
const originalWindowConfig = window.__MECERKA_RUNTIME_CONFIG__

async function loadRuntimeConfigModule() {
  vi.resetModules()
  return import("@/lib/runtime-config")
}

function setLocation(url: string) {
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: new URL(url),
  })
}

describe("runtime-config", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    delete window.__MECERKA_RUNTIME_CONFIG__
  })

  afterEach(() => {
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: originalLocation,
    })
    window.__MECERKA_RUNTIME_CONFIG__ = originalWindowConfig
    delete process.env.API_BASE_URL
    delete process.env.NEXT_PUBLIC_API_URL
    delete process.env.STRIPE_PUBLISHABLE_KEY
    delete process.env.NEXT_PUBLIC_REQUIRE_MFA
  })

  it("prefers the injected runtime api base url in the browser", async () => {
    window.__MECERKA_RUNTIME_CONFIG__ = {
      apiBaseUrl: "https://demo-api.mecerka.test",
    }
    setLocation("http://localhost:3001/es")
    const { getApiBaseUrl } = await loadRuntimeConfigModule()

    expect(getApiBaseUrl()).toBe("https://demo-api.mecerka.test")
  })

  it("uses NEXT_PUBLIC_API_URL on localhost when no injected config exists", async () => {
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:4000"
    setLocation("http://localhost:3001/es")
    const { getApiBaseUrl } = await loadRuntimeConfigModule()

    expect(getApiBaseUrl()).toBe("http://localhost:4000")
  })

  it("falls back to same-origin /api on remote hosts", async () => {
    setLocation("https://mecerka.me/es/products")
    const { getApiBaseUrl, getTrackingBaseUrl } = await loadRuntimeConfigModule()

    expect(getApiBaseUrl()).toBe("https://mecerka.me/api")
    expect(getTrackingBaseUrl()).toBe("https://mecerka.me")
  })

  it("ignores a cross-origin injected api base url on remote hosts", async () => {
    setLocation("https://demo.mecerka.me/es")
    window.__MECERKA_RUNTIME_CONFIG__ = {
      apiBaseUrl: "https://mecerka.me/api",
    }
    const { getApiBaseUrl } = await loadRuntimeConfigModule()

    expect(getApiBaseUrl()).toBe("https://demo.mecerka.me/api")
  })

  it("loads and caches the public runtime config from /runtime-config", async () => {
    setLocation("https://demo.mecerka.me/es")
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            apiBaseUrl: "https://mecerka.me/api",
            stripePublishableKey: "pk_test_123",
            requireMfa: false,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )

    const { getPublicRuntimeConfig } = await loadRuntimeConfigModule()

    await expect(getPublicRuntimeConfig()).resolves.toEqual({
      apiBaseUrl: "https://demo.mecerka.me/api",
      stripePublishableKey: "pk_test_123",
      requireMfa: false,
    })
    await expect(getPublicRuntimeConfig()).resolves.toEqual({
      apiBaseUrl: "https://demo.mecerka.me/api",
      stripePublishableKey: "pk_test_123",
      requireMfa: false,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("falls back to derived browser config when runtime-config fetch fails", async () => {
    setLocation("https://demo.mecerka.me/es")
    process.env.NEXT_PUBLIC_REQUIRE_MFA = "false"
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("offline"))

    const { getPublicRuntimeConfig } = await loadRuntimeConfigModule()

    await expect(getPublicRuntimeConfig()).resolves.toEqual({
      apiBaseUrl: "https://demo.mecerka.me/api",
      stripePublishableKey: null,
      requireMfa: false,
    })
  })

  it("returns a trimmed tracking base url when api base ends with a slash", async () => {
    window.__MECERKA_RUNTIME_CONFIG__ = {
      apiBaseUrl: "https://api.mecerka.test/",
    }
    const { getTrackingBaseUrl } = await loadRuntimeConfigModule()

    expect(getTrackingBaseUrl()).toBe("https://api.mecerka.test")
  })
})
