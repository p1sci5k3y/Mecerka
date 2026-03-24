import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("@/components/navbar", () => ({
  Navbar: () => <nav data-testid="navbar" />,
}))

vi.mock("@/components/footer", () => ({
  Footer: () => <footer data-testid="footer" />,
}))

describe("PublicInfoPage", () => {
  it("renders the privacy content in spanish", async () => {
    const { PublicInfoPage } = await import("@/components/public-info-page")
    render(<PublicInfoPage locale="es" pageKey="privacy" />)

    expect(screen.getByRole("heading", { name: "Política de Privacidad" })).toBeInTheDocument()
    expect(screen.getByText(/gestionar cuentas, pedidos, pagos y soporte/i)).toBeInTheDocument()
  })

  it("renders the status content in english", async () => {
    const { PublicInfoPage } = await import("@/components/public-info-page")
    render(<PublicInfoPage locale="en" pageKey="status" />)

    expect(screen.getByRole("heading", { name: "Service Status" })).toBeInTheDocument()
    expect(screen.getByText(/public web, API, authentication and checkout/i)).toBeInTheDocument()
  })
})
