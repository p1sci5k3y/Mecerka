import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("@/components/navbar", () => ({
  Navbar: () => <nav data-testid="navbar" />,
}))

vi.mock("@/components/footer", () => ({
  Footer: () => <footer data-testid="footer" />,
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, asChild, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) =>
    asChild ? <>{children}</> : <button {...rest}>{children}</button>,
}))

vi.mock("@/components/ui/section-header", () => ({
  SectionHeader: ({ title, subtitle }: { title: string; subtitle: string }) => (
    <div>
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </div>
  ),
}))

vi.mock("@/lib/navigation", () => ({
  Link: ({ href, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock("next/dynamic", () => ({
  default: () =>
    function DynamicMapMock(props: Record<string, unknown>) {
      return <div data-testid="dynamic-map">{JSON.stringify(props)}</div>
    },
}))

vi.mock("@/components/tracking/RunnerSimulator", () => ({
  default: ({ orderId }: { orderId: number }) => <div data-testid="runner-simulator">{orderId}</div>,
}))

describe("store and tracking helper pages", () => {
  it("renders the public store fallback and links back to the catalog", async () => {
    const Page = (await import("@/app/[locale]/store/[providerId]/page")).default
    render(<Page />)

    expect(screen.getByText("Escaparate público no disponible")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Ir al catálogo real/i })).toHaveAttribute(
      "href",
      "/products",
    )
  })

  it("renders the tracking test harness with both the map and simulator", async () => {
    const Page = (await import("@/app/[locale]/tracking/test/page")).default
    render(<Page />)

    expect(screen.getByText(/Real-Time Tracking Test/i)).toBeInTheDocument()
    expect(screen.getByTestId("dynamic-map")).toHaveTextContent('"orderId":999')
    expect(screen.getByTestId("runner-simulator")).toHaveTextContent("999")
  })

  it("renders the root app home text", async () => {
    const Page = (await import("@/app/page")).default
    render(<Page />)

    expect(screen.getByText("Mecerka - Marketplace Local")).toBeInTheDocument()
    expect(
      screen.getByText(/Plataforma tipo marketplace para comercio de cercanía/i),
    ).toBeInTheDocument()
  })
})
