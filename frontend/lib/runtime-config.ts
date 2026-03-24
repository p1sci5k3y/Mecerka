type PublicRuntimeConfig = {
  apiBaseUrl?: string
  stripePublishableKey?: string | null
  requireMfa?: boolean
}

declare global {
  interface Window {
    __MECERKA_RUNTIME_CONFIG__?: PublicRuntimeConfig
  }
}

let runtimeConfigPromise: Promise<PublicRuntimeConfig> | null = null

function isLocalhost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1"
}

function getSameOriginApiBaseUrl() {
  return `${globalThis.location.origin}/api`
}

function normalizeBrowserApiBaseUrl(apiBaseUrl?: string) {
  if (!apiBaseUrl) {
    return getSameOriginApiBaseUrl()
  }

  if (isLocalhost(globalThis.location.hostname)) {
    return apiBaseUrl
  }

  try {
    const resolved = new URL(apiBaseUrl, globalThis.location.origin)
    if (resolved.origin !== globalThis.location.origin) {
      return getSameOriginApiBaseUrl()
    }

    return resolved.toString().replace(/\/$/, "")
  } catch {
    return getSameOriginApiBaseUrl()
  }
}

export function getApiBaseUrl() {
  if (typeof window === "undefined") {
    return (
      process.env.INTERNAL_API_URL ||
      process.env.API_BASE_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      "http://localhost:3000"
    )
  }

  const runtimeApiBaseUrl = window.__MECERKA_RUNTIME_CONFIG__?.apiBaseUrl
  if (runtimeApiBaseUrl) {
    return normalizeBrowserApiBaseUrl(runtimeApiBaseUrl)
  }

  if (isLocalhost(globalThis.location.hostname)) {
    return process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"
  }

  return getSameOriginApiBaseUrl()
}

export async function getPublicRuntimeConfig() {
  if (typeof window === "undefined") {
    return {
      apiBaseUrl: process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || "/api",
      stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
      requireMfa: process.env.NEXT_PUBLIC_REQUIRE_MFA !== "false",
    } satisfies PublicRuntimeConfig
  }

  if (window.__MECERKA_RUNTIME_CONFIG__) {
    return window.__MECERKA_RUNTIME_CONFIG__
  }

  if (!runtimeConfigPromise) {
    runtimeConfigPromise = fetch("/runtime-config", {
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("No pudimos cargar la configuración pública.")
        }
        const data = (await response.json()) as PublicRuntimeConfig
        const normalized = {
          ...data,
          apiBaseUrl: normalizeBrowserApiBaseUrl(data.apiBaseUrl),
        } satisfies PublicRuntimeConfig
        window.__MECERKA_RUNTIME_CONFIG__ = normalized
        return normalized
      })
      .catch(() => ({
        apiBaseUrl: getApiBaseUrl(),
        stripePublishableKey: null,
        requireMfa: process.env.NEXT_PUBLIC_REQUIRE_MFA !== "false",
      }))
  }

  return runtimeConfigPromise
}

export function getTrackingBaseUrl() {
  const apiBaseUrl = getApiBaseUrl()
  return apiBaseUrl.endsWith("/api")
    ? apiBaseUrl.slice(0, -4)
    : apiBaseUrl.replace(/\/$/, "")
}
