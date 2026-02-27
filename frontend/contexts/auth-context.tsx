"use client"

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react"
import { setToken } from "@/lib/api"
import { authService, type LoginPayload, type RegisterPayload } from "@/lib/services/auth-service"
import type { User } from "@/lib/types"

interface AuthState {
  user: User | null
  token: string | null
  isLoading: boolean
  isAuthenticated: boolean
}

interface AuthContextType extends AuthState {
  login: (payload: LoginPayload) => Promise<void>
  register: (payload: RegisterPayload) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    isLoading: true,
    isAuthenticated: false,
  })

  const hydrateUser = useCallback(async () => {
    try {
      const token = localStorage.getItem('token')
      if (!token) throw new Error('No token')

      // Critical: Set token in memory so API client can use it
      setToken(token)

      const userResponse = await authService.getProfile()
      const user = userResponse as User & { userId?: number }

      // Fallback for missing name/email from backend
      // Backend returns 'userId', not 'id'
      const uiUser: User = {
        ...user,
        userId: user.userId || user.id || 0,
        name: user.name || `User ${user.userId}`,
        email: user.email || `user${user.userId}@mecerka.local`
      }
      setState({ user: uiUser, token, isLoading: false, isAuthenticated: true })
    } catch {
      setToken(null)
      setState({ user: null, token: null, isLoading: false, isAuthenticated: false })
    }
  }, [])

  useEffect(() => {
    hydrateUser()
  }, [hydrateUser])

  const login = async (payload: LoginPayload) => {
    const response: any = await authService.login(payload)
    // Set token immediately after login directly to local storage
    if (response.access_token) {
      localStorage.setItem('token', response.access_token)
      setToken(response.access_token)
      await hydrateUser()
    }
  }

  const register = async (payload: RegisterPayload) => {
    const response: any = await authService.register(payload)
    if (response.access_token) {
      localStorage.setItem('token', response.access_token)
      setToken(response.access_token)
      await hydrateUser()
    }
  }

  const logout = () => {
    localStorage.removeItem('token')
    setToken(null)
    setState({ user: null, token: null, isLoading: false, isAuthenticated: false })
  }

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
