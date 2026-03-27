import { beforeEach, describe, expect, it, vi } from "vitest"
import { mfaService } from "@/lib/services/mfa-service"

const apiPostMock = vi.fn()

vi.mock("@/lib/api", () => ({
  api: {
    post: (...args: unknown[]) => apiPostMock(...args),
  },
}))

describe("mfaService", () => {
  beforeEach(() => {
    apiPostMock.mockReset()
  })

  it("returns disabled by default for status until backend status exists", async () => {
    await expect(mfaService.getStatus()).resolves.toBe("disabled")
  })

  it("forwards MFA enable and verify requests", async () => {
    apiPostMock.mockResolvedValue({})

    await mfaService.enable()
    await mfaService.verify("123456")
    await expect(mfaService.disable()).resolves.toBeUndefined()

    expect(apiPostMock).toHaveBeenNthCalledWith(1, "/auth/mfa/setup")
    expect(apiPostMock).toHaveBeenNthCalledWith(2, "/auth/mfa/verify", {
      token: "123456",
    })
  })
})
