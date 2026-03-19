"use client"

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from "react"
import { usePathname } from "@/lib/navigation"
import { authService, type LoginPayload, type RegisterPayload } from "@/lib/services/auth-service"
import type { User } from "@/lib/types"

interface AuthState {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
}

interface AuthContextType extends AuthState {
  login: (payload: LoginPayload) => Promise<any>
  register: (payload: RegisterPayload) => Promise<any>
  verifyMagicLink: (token: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

function isAuthHydrationRequired(pathname: string) {
  const protectedPrefixes = ["/dashboard", "/admin", "/profile", "/mfa", "/provider", "/runner", "/orders"]
  return protectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname()
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  })

  const hydrateUser = useCallback(async () => {
    try {
      const user = await authService.getProfile() as User
      setState({ user, isLoading: false, isAuthenticated: true })
    } catch {
      setState({ user: null, isLoading: false, isAuthenticated: false })
    }
  }, [])

  useEffect(() => {
    if (!isAuthHydrationRequired(pathname)) {
      setState((current) =>
        current.isLoading
          ? { user: null, isLoading: false, isAuthenticated: false }
          : current,
      )
      return
    }

    hydrateUser()
  }, [hydrateUser, pathname])

  const login = useCallback(async (payload: LoginPayload) => {
    const response: any = await authService.login(payload)
    if (!response?.mfaRequired) {
      await hydrateUser()
    }
    return response
  }, [hydrateUser])

  const register = useCallback(async (payload: RegisterPayload) => {
    return authService.register(payload)
  }, [])

  const verifyMagicLink = useCallback(async (token: string) => {
    await authService.verifyMagicLink(token)
    await hydrateUser()
  }, [hydrateUser])

  const logout = useCallback(async () => {
    try {
      await authService.logout()
    } finally {
      setState({ user: null, isLoading: false, isAuthenticated: false })
    }
  }, [])

  const contextValue = useMemo(() => ({
    ...state,
    login,
    register,
    verifyMagicLink,
    logout
  }), [state, login, register, verifyMagicLink, logout])

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
