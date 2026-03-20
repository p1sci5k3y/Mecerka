// Browser storage slot for a UI hydration hint. It is not a credential or secret.
const AUTH_SESSION_HINT_STORAGE_SLOT = "mecerka-auth-session-hydration"
const AUTH_SESSION_HINT_TTL_MS = 12 * 60 * 60 * 1000

type AuthSessionHint = {
  marker: "active"
  expiresAt: number
}

function getSessionStorage() {
  if (typeof globalThis.window === "undefined") {
    return null
  }

  return globalThis.window.sessionStorage
}

function readHint(): AuthSessionHint | null {
  const storage = getSessionStorage()
  if (!storage) return null

  const raw = storage.getItem(AUTH_SESSION_HINT_STORAGE_SLOT)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<AuthSessionHint>
    if (parsed.marker !== "active" || typeof parsed.expiresAt !== "number") {
      storage.removeItem(AUTH_SESSION_HINT_STORAGE_SLOT)
      return null
    }

    if (parsed.expiresAt <= Date.now()) {
      storage.removeItem(AUTH_SESSION_HINT_STORAGE_SLOT)
      return null
    }

    return parsed as AuthSessionHint
  } catch {
    storage.removeItem(AUTH_SESSION_HINT_STORAGE_SLOT)
    return null
  }
}

export function hasAuthSessionHint() {
  return readHint() !== null
}

export function setAuthSessionHint() {
  const storage = getSessionStorage()
  if (!storage) return
  const payload: AuthSessionHint = {
    marker: "active",
    expiresAt: Date.now() + AUTH_SESSION_HINT_TTL_MS,
  }
  storage.setItem(AUTH_SESSION_HINT_STORAGE_SLOT, JSON.stringify(payload))
}

export function clearAuthSessionHint() {
  const storage = getSessionStorage()
  if (!storage) return
  storage.removeItem(AUTH_SESSION_HINT_STORAGE_SLOT)
}
