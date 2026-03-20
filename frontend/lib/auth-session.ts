const AUTH_SESSION_HINT_KEY = "mecerka-auth-session-hint"
const AUTH_SESSION_HINT_TTL_MS = 12 * 60 * 60 * 1000

type AuthSessionHint = {
  value: "1"
  expiresAt: number
}

function hasWindow() {
  return typeof window !== "undefined"
}

function readHint(): AuthSessionHint | null {
  if (!hasWindow()) return null

  const raw = window.sessionStorage.getItem(AUTH_SESSION_HINT_KEY)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<AuthSessionHint>
    if (parsed.value !== "1" || typeof parsed.expiresAt !== "number") {
      window.sessionStorage.removeItem(AUTH_SESSION_HINT_KEY)
      return null
    }

    if (parsed.expiresAt <= Date.now()) {
      window.sessionStorage.removeItem(AUTH_SESSION_HINT_KEY)
      return null
    }

    return parsed as AuthSessionHint
  } catch {
    window.sessionStorage.removeItem(AUTH_SESSION_HINT_KEY)
    return null
  }
}

export function hasAuthSessionHint() {
  return readHint() !== null
}

export function setAuthSessionHint() {
  if (!hasWindow()) return
  const payload: AuthSessionHint = {
    value: "1",
    expiresAt: Date.now() + AUTH_SESSION_HINT_TTL_MS,
  }
  window.sessionStorage.setItem(AUTH_SESSION_HINT_KEY, JSON.stringify(payload))
}

export function clearAuthSessionHint() {
  if (!hasWindow()) return
  window.sessionStorage.removeItem(AUTH_SESSION_HINT_KEY)
}
