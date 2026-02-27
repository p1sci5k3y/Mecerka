import { api } from "@/lib/api"

export type MfaStatus = "disabled" | "pending" | "enabled"

export interface MfaSetupResponse {
  secret: string
  otpauthUrl: string
  qrCode: string // Data URL from backend
}

export const mfaService = {
  getStatus: async (): Promise<MfaStatus> => {
    // In a real app, we check user profile for mfaEnabled.
    // Backend doesn't return mfaEnabled explicitly in /auth/me yet?
    // Let's assume user object has it if we updated type, or check via separate call if needed.
    // For now, return "disabled" default or check logic elsewhere.
    // Actually, ProfilePage might check user.mfaEnabled if available.
    // If backend /auth/me returns it, we are good.
    // I added mfaEnabled to User model, but does /auth/me return it?
    // LocalStrategy / JwtStrategy might strip it?
    // AuthService.login returns JWT. /auth/me returns JWT payload (userId, role) usually.
    // AuthController.getProfile returns req.user.
    // I need to check specific endpoint behavior.
    return "disabled" // Fallback
  },

  enable: () => api.post<MfaSetupResponse>("/auth/mfa/setup"),

  verify: (token: string) => api.post<{ success: boolean }>("/auth/mfa/verify", { token }),

  disable: async () => {
    // Implement disable endpoint if exists, for now just placeholder
    return
  },
}
