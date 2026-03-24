import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

const mockUseLocale = vi.fn(() => "es")

vi.mock("@/lib/navigation", () => ({
  Link: ({ href, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock("next-intl", () => ({
  useLocale: () => mockUseLocale(),
}))

describe("Footer", () => {
  it("renders public footer routes instead of placeholder hashes", async () => {
    const { Footer } = await import("@/components/footer")
    render(<Footer />)

    expect(screen.getByRole("link", { name: "Privacidad" })).toHaveAttribute("href", "/privacy")
    expect(screen.getByRole("link", { name: "Términos" })).toHaveAttribute("href", "/terms")
    expect(screen.getByRole("link", { name: "Cookies" })).toHaveAttribute("href", "/cookies")
    expect(screen.getByRole("link", { name: "FAQ" })).toHaveAttribute("href", "/faq")
    expect(screen.getByRole("link", { name: "Contacto" })).toHaveAttribute("href", "/contact")
    expect(screen.getByRole("link", { name: "Estado" })).toHaveAttribute("href", "/status")
  })

  it("switches labels for the english locale", async () => {
    mockUseLocale.mockReturnValue("en")
    const { Footer } = await import("@/components/footer")
    render(<Footer />)

    expect(screen.getByRole("link", { name: "Privacy" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Terms" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Status" })).toBeInTheDocument()
  })
})
