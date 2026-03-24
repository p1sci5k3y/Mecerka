import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  clearAuthSessionHint,
  hasAuthSessionHint,
  setAuthSessionHint,
} from "@/lib/auth-session"

describe("auth-session", () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    vi.useRealTimers()
  })

  it("stores and clears an active session hint", () => {
    expect(hasAuthSessionHint()).toBe(false)

    setAuthSessionHint()

    expect(hasAuthSessionHint()).toBe(true)

    clearAuthSessionHint()

    expect(hasAuthSessionHint()).toBe(false)
  })

  it("drops malformed session payloads safely", () => {
    window.sessionStorage.setItem(
      "mecerka-auth-session-hydration",
      JSON.stringify({ marker: "broken" }),
    )

    expect(hasAuthSessionHint()).toBe(false)
    expect(
      window.sessionStorage.getItem("mecerka-auth-session-hydration"),
    ).toBeNull()
  })

  it("drops invalid JSON safely", () => {
    window.sessionStorage.setItem(
      "mecerka-auth-session-hydration",
      "{invalid-json",
    )

    expect(hasAuthSessionHint()).toBe(false)
    expect(
      window.sessionStorage.getItem("mecerka-auth-session-hydration"),
    ).toBeNull()
  })

  it("drops expired hints", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-24T10:00:00.000Z"))

    setAuthSessionHint()
    expect(hasAuthSessionHint()).toBe(true)

    vi.advanceTimersByTime(12 * 60 * 60 * 1000 + 1)

    expect(hasAuthSessionHint()).toBe(false)
    expect(
      window.sessionStorage.getItem("mecerka-auth-session-hydration"),
    ).toBeNull()
  })
})
