import { describe, expect, it, vi } from "vitest"

const mockRedirect = vi.fn()

vi.mock("next/navigation", () => ({
  redirect: (href: string) => mockRedirect(href),
}))

describe("locale catch-all routing", () => {
  it("redirects unknown spanish routes to the spanish home", async () => {
    const Page = (await import("@/app/[locale]/[...rest]/page")).default

    await Page({ params: Promise.resolve({ locale: "es", rest: ["foo", "bar"] }) })

    expect(mockRedirect).toHaveBeenCalledWith("/es")
  })

  it("normalizes unknown locales back to spanish home", async () => {
    const Page = (await import("@/app/[locale]/[...rest]/page")).default

    await Page({ params: Promise.resolve({ locale: "fr", rest: ["missing"] }) })

    expect(mockRedirect).toHaveBeenCalledWith("/es")
  })

  it("redirects unknown english routes to the english home", async () => {
    const Page = (await import("@/app/[locale]/[...rest]/page")).default

    await Page({ params: Promise.resolve({ locale: "en", rest: ["missing"] }) })

    expect(mockRedirect).toHaveBeenCalledWith("/en")
  })
})
