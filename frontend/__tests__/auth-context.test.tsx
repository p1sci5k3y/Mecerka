import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { User } from "@/lib/types"
import { AuthProvider, useAuth } from "@/contexts/auth-context"
import { ApiError } from "@/lib/api"

const usePathnameMock = vi.fn()
const getProfileMock = vi.fn()
const loginMock = vi.fn()
const registerMock = vi.fn()
const logoutMock = vi.fn()
const hasAuthSessionHintMock = vi.fn()
const setAuthSessionHintMock = vi.fn()
const clearAuthSessionHintMock = vi.fn()

vi.mock("@/lib/navigation", () => ({
  usePathname: () => usePathnameMock(),
}))

vi.mock("@/lib/services/auth-service", () => ({
  authService: {
    getProfile: (...args: unknown[]) => getProfileMock(...args),
    login: (...args: unknown[]) => loginMock(...args),
    register: (...args: unknown[]) => registerMock(...args),
    logout: (...args: unknown[]) => logoutMock(...args),
  },
}))

vi.mock("@/lib/auth-session", () => ({
  hasAuthSessionHint: () => hasAuthSessionHintMock(),
  setAuthSessionHint: (...args: unknown[]) => setAuthSessionHintMock(...args),
  clearAuthSessionHint: (...args: unknown[]) => clearAuthSessionHintMock(...args),
}))

function makeUser(overrides: Partial<User> = {}): User {
  return {
    userId: "user-1",
    email: "alex@example.com",
    name: "Alex Rivera",
    roles: ["CLIENT"],
    mfaEnabled: true,
    hasPin: true,
    ...overrides,
  }
}

function AuthProbe() {
  const { user, isAuthenticated, isLoading, login, register, logout } = useAuth()

  return (
    <div>
      <p>loading:{String(isLoading)}</p>
      <p>authenticated:{String(isAuthenticated)}</p>
      <p>user:{user?.email ?? "none"}</p>
      <button
        type="button"
        onClick={() =>
          void login({ email: "alex@example.com", password: "secret" })
        }
      >
        login
      </button>
      <button
        type="button"
        onClick={() =>
          void register({
            email: "alex@example.com",
            password: "secret",
            name: "Alex",
          })
        }
      >
        register
      </button>
      <button
        type="button"
        onClick={() => {
          void logout().catch(() => undefined)
        }}
      >
        logout
      </button>
    </div>
  )
}

describe("AuthProvider", () => {
  beforeEach(() => {
    usePathnameMock.mockReset()
    getProfileMock.mockReset()
    loginMock.mockReset()
    registerMock.mockReset()
    logoutMock.mockReset()
    hasAuthSessionHintMock.mockReset()
    setAuthSessionHintMock.mockReset()
    clearAuthSessionHintMock.mockReset()
  })

  it("skips hydration on public routes when there is no auth hint", async () => {
    usePathnameMock.mockReturnValue("/")
    hasAuthSessionHintMock.mockReturnValue(false)

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText("loading:false")).toBeInTheDocument()
    })

    expect(getProfileMock).not.toHaveBeenCalled()
    expect(screen.getByText("authenticated:false")).toBeInTheDocument()
    expect(screen.getByText("user:none")).toBeInTheDocument()
  })

  it("hydrates the user on protected routes and marks the session as active", async () => {
    usePathnameMock.mockReturnValue("/dashboard")
    hasAuthSessionHintMock.mockReturnValue(false)
    getProfileMock.mockResolvedValueOnce(makeUser())

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText("authenticated:true")).toBeInTheDocument()
    })

    expect(getProfileMock).toHaveBeenCalled()
    expect(setAuthSessionHintMock).toHaveBeenCalled()
    expect(screen.getByText("user:alex@example.com")).toBeInTheDocument()
  })

  it("hydrates immediately after a successful login without MFA challenge", async () => {
    usePathnameMock.mockReturnValue("/profile")
    hasAuthSessionHintMock.mockReturnValue(false)
    getProfileMock.mockResolvedValue(makeUser())
    loginMock.mockResolvedValueOnce({
      access_token: "token",
      mfaRequired: false,
      user: {
        id: "user-1",
        email: "alex@example.com",
        roles: ["CLIENT"],
        mfaEnabled: true,
        hasPin: true,
      },
    })

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText("authenticated:true")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: "login" }))

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith({
        email: "alex@example.com",
        password: "secret",
      })
    })

    expect(setAuthSessionHintMock).toHaveBeenCalled()
    expect(getProfileMock).toHaveBeenCalledTimes(2)
  })

  it("does not hydrate profile again when login still requires MFA", async () => {
    usePathnameMock.mockReturnValue("/")
    hasAuthSessionHintMock.mockReturnValue(false)
    loginMock.mockResolvedValueOnce({
      access_token: "token",
      mfaRequired: true,
      user: {
        id: "user-1",
        email: "alex@example.com",
        roles: ["CLIENT"],
        mfaEnabled: true,
        hasPin: true,
      },
    })

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText("loading:false")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: "login" }))

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalled()
    })

    expect(getProfileMock).not.toHaveBeenCalled()
    expect(setAuthSessionHintMock).not.toHaveBeenCalled()
  })

  it("keeps the provisional session after login when auth hydration fails for a non-401 error", async () => {
    usePathnameMock.mockReturnValue("/")
    hasAuthSessionHintMock.mockReturnValue(false)
    loginMock.mockResolvedValueOnce({
      access_token: "token",
      mfaRequired: false,
      user: {
        id: "user-1",
        email: "alex@example.com",
        roles: ["PROVIDER"],
        mfaEnabled: true,
        hasPin: true,
      },
    })
    getProfileMock.mockRejectedValueOnce(new Error("temporary upstream failure"))

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText("loading:false")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: "login" }))

    await waitFor(() => {
      expect(screen.getByText("authenticated:true")).toBeInTheDocument()
    })

    expect(screen.getByText("user:alex@example.com")).toBeInTheDocument()
    expect(clearAuthSessionHintMock).not.toHaveBeenCalled()
  })

  it("clears the session when auth hydration returns 401", async () => {
    usePathnameMock.mockReturnValue("/dashboard")
    hasAuthSessionHintMock.mockReturnValue(true)
    getProfileMock.mockRejectedValueOnce(new ApiError("Unauthorized", 401))

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText("authenticated:false")).toBeInTheDocument()
    })

    expect(clearAuthSessionHintMock).toHaveBeenCalled()
  })

  it("clears session state even if logout request fails", async () => {
    usePathnameMock.mockReturnValue("/dashboard")
    hasAuthSessionHintMock.mockReturnValue(false)
    getProfileMock.mockResolvedValueOnce(makeUser())
    logoutMock.mockRejectedValueOnce(new Error("network"))

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText("authenticated:true")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: "logout" }))

    await waitFor(() => {
      expect(screen.getByText("authenticated:false")).toBeInTheDocument()
    })

    expect(clearAuthSessionHintMock).toHaveBeenCalled()
    expect(screen.getByText("user:none")).toBeInTheDocument()
  })

  it("forwards register calls through the auth service", async () => {
    usePathnameMock.mockReturnValue("/")
    hasAuthSessionHintMock.mockReturnValue(false)
    registerMock.mockResolvedValueOnce({ message: "ok" })

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText("loading:false")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: "register" }))

    await waitFor(() => {
      expect(registerMock).toHaveBeenCalledWith({
        email: "alex@example.com",
        password: "secret",
        name: "Alex",
      })
    })
  })
})
