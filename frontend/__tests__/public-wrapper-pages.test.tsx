import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("@/components/public-info-page", () => ({
  PublicInfoPage: ({
    locale,
    pageKey,
  }: {
    locale: string
    pageKey: string
  }) => (
    <div>
      {locale}:{pageKey}
    </div>
  ),
}))

describe("public wrapper pages", () => {
  it("forwards locale and page keys for the public info routes", async () => {
    const pages = [
      { module: "@/app/[locale]/contact/page", key: "contact" },
      { module: "@/app/[locale]/cookies/page", key: "cookies" },
      { module: "@/app/[locale]/faq/page", key: "faq" },
      { module: "@/app/[locale]/privacy/page", key: "privacy" },
      { module: "@/app/[locale]/terms/page", key: "terms" },
      { module: "@/app/[locale]/status/page", key: "status" },
    ] as const

    for (const page of pages) {
      const mod = await import(page.module)
      const element = await mod.default({
        params: Promise.resolve({ locale: "es" }),
      })
      const { unmount } = render(element)
      expect(screen.getByText(`es:${page.key}`)).toBeInTheDocument()
      unmount()
    }
  })
})
