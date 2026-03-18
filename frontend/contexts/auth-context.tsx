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

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  })

  const hydrateUser = useCallback(async () => {
    try {
      const userResponse = await authService.getProfile()
      const user = userResponse as User & { userId?: number }

      // Fallback for missing name/email from backend
      // Backend returns 'userId', not 'id'
      const uiUser: User = {
        ...user,
        userId: user.userId || (user as any).id || 0,
        name: user.name || `User ${user.userId}`,
        email: user.email || `user${user.userId}@mecerka.local`
      }
      setState({ user: uiUser, isLoading: false, isAuthenticated: true })
    } catch {
      setState({ user: null, isLoading: false, isAuthenticated: false })
    }
  }, [])

  useEffect(() => {
    hydrateUser()
  }, [hydrateUser])

  const login = useCallback(async (payload: LoginPayload) => {
    const response: any = await authService.login(payload)
    await hydrateUser()
    return response
  }, [hydrateUser])

  const register = useCallback(async (payload: RegisterPayload) => {
    const response: any = await authService.register(payload)
    await hydrateUser()
    return response
  }, [hydrateUser])

  const verifyMagicLink = useCallback(async (token: string) => {
    const response: any = await authService.verifyMagicLink(token)
    await hydrateUser()
    return response
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
