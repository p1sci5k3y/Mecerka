import { beforeEach, describe, expect, it, vi } from "vitest"
import { authService } from "@/lib/services/auth-service"

const apiGetMock = vi.fn()
const apiPostMock = vi.fn()

vi.mock("@/lib/api", () => ({
  api: {
    get: (...args: unknown[]) => apiGetMock(...args),
    post: (...args: unknown[]) => apiPostMock(...args),
  },
}))

describe("authService", () => {
  beforeEach(() => {
    apiGetMock.mockReset()
    apiPostMock.mockReset()
  })

  it("forwards register, login and logout requests to the auth endpoints", async () => {
    apiPostMock.mockResolvedValue({})

    await authService.register({
      name: "User Demo",
      email: "user.demo@local.test",
      password: "DemoPass123!",
    })
    await authService.login({
      email: "user.demo@local.test",
      password: "DemoPass123!",
    })
    await authService.logout()

    expect(apiPostMock).toHaveBeenNthCalledWith(1, "/auth/register", {
      name: "User Demo",
      email: "user.demo@local.test",
      password: "DemoPass123!",
    })
    expect(apiPostMock).toHaveBeenNthCalledWith(2, "/auth/login", {
      email: "user.demo@local.test",
      password: "DemoPass123!",
    })
    expect(apiPostMock).toHaveBeenNthCalledWith(3, "/auth/logout")
  })

  it("forwards profile and MFA-related auth endpoints", async () => {
    apiGetMock.mockResolvedValue({})
    apiPostMock.mockResolvedValue({})

    await authService.getProfile()
    await authService.generateMfaEmailOtp()
    await authService.setupMfa("123456")
    await authService.verifyMfa("654321")
    await authService.verifyEmail("token-123")

    expect(apiGetMock).toHaveBeenNthCalledWith(1, "/auth/me")
    expect(apiPostMock).toHaveBeenNthCalledWith(1, "/auth/mfa/generate-email-otp")
    expect(apiPostMock).toHaveBeenNthCalledWith(2, "/auth/mfa/setup", { otpCode: "123456" })
    expect(apiPostMock).toHaveBeenNthCalledWith(3, "/auth/mfa/verify", { token: "654321" })
    expect(apiGetMock).toHaveBeenNthCalledWith(2, "/auth/verify?token=token-123")
  })
})
