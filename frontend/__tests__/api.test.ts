import { beforeEach, describe, expect, it, vi } from "vitest"
import { api } from "@/lib/api"

const getApiBaseUrlMock = vi.fn()

vi.mock("@/lib/runtime-config", () => ({
  getApiBaseUrl: () => getApiBaseUrlMock(),
}))

describe("api", () => {
  beforeEach(() => {
    getApiBaseUrlMock.mockReset()
    getApiBaseUrlMock.mockReturnValue("https://api.mecerka.test")
    vi.restoreAllMocks()
  })

  it("builds JSON requests with credentials included", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )

    const result = await api.post("/cart/items", { productId: "1", quantity: 2 }, {
      headers: { "X-Test": "yes" },
    })

    expect(result).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.mecerka.test/cart/items",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ productId: "1", quantity: 2 }),
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-Test": "yes",
        }),
      }),
    )
  })

  it("returns an empty object for 204 responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, { status: 204 }))

    await expect(api.delete("/cart/items/1")).resolves.toEqual({})
  })

  it("throws a typed error with backend message when available", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "No autorizado" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    )

    await expect(api.get("/me")).rejects.toMatchObject({
      name: "ApiError",
      message: "No autorizado",
      statusCode: 401,
    })
  })

  it("falls back to a generic message when error body is not JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("boom", {
        status: 500,
        headers: { "Content-Type": "text/plain" },
      }),
    )

    await expect(api.get("/broken")).rejects.toMatchObject({
      name: "ApiError",
      message: "Ha ocurrido un error",
      statusCode: 500,
    })
  })
})
