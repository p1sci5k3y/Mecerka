import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"

const listMyIncidentsMock = vi.fn()
const getMyRefundsMock = vi.fn()

vi.mock("@/lib/services/delivery-incidents-service", () => ({
  deliveryIncidentsService: {
    listMyIncidents: (...args: unknown[]) => listMyIncidentsMock(...args),
  },
}))

vi.mock("@/lib/services/refunds-service", () => ({
  refundsService: {
    getMyRefunds: (...args: unknown[]) => getMyRefundsMock(...args),
  },
}))

vi.mock("@/components/protected-route", () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock("@/components/navbar", () => ({
  Navbar: () => <nav data-testid="navbar" />,
}))

vi.mock("@/components/footer", () => ({
  Footer: () => <footer data-testid="footer" />,
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    asChild,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) =>
    asChild ? <>{children}</> : <button {...rest}>{children}</button>,
}))

vi.mock("@/lib/navigation", () => ({
  Link: ({ href, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

describe("Profile support page", () => {
  beforeEach(() => {
    listMyIncidentsMock.mockReset()
    getMyRefundsMock.mockReset()
  })

  it("renders the client-wide support inbox with direct order actions", async () => {
    listMyIncidentsMock.mockResolvedValueOnce([
      {
        id: "incident-1",
        orderId: "order-1",
        deliveryOrderId: "delivery-1",
        reporterRole: "CLIENT",
        type: "MISSING_ITEMS",
        status: "OPEN",
        description: "Falta un producto",
        evidenceUrl: null,
        createdAt: "2026-03-27T10:00:00.000Z",
        resolvedAt: null,
      },
    ])
    getMyRefundsMock.mockResolvedValueOnce([
      {
        id: "refund-1",
        orderId: "order-2",
        incidentId: null,
        providerOrderId: "provider-order-1",
        deliveryOrderId: null,
        type: "PROVIDER_PARTIAL",
        status: "UNDER_REVIEW",
        amount: 8.5,
        currency: "EUR",
        requestedById: "client-1",
        reviewedById: null,
        externalRefundId: null,
        createdAt: "2026-03-27T11:00:00.000Z",
        reviewedAt: null,
        completedAt: null,
      },
    ])

    const Page = (await import("@/app/[locale]/profile/support/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("Soporte y devoluciones")).toBeInTheDocument()
    })

    expect(screen.getByText("Falta un producto")).toBeInTheDocument()
    expect(screen.getByText("Devolución parcial de comercio")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Seguir pedido" })).toHaveAttribute(
      "href",
      "/orders/order-1/track",
    )
    expect(screen.getByRole("link", { name: "Ir al soporte del pedido" })).toHaveAttribute(
      "href",
      "/orders/order-2/track",
    )
  })

  it("shows the empty states when the client has no support cases", async () => {
    listMyIncidentsMock.mockResolvedValueOnce([])
    getMyRefundsMock.mockResolvedValueOnce([])

    const Page = (await import("@/app/[locale]/profile/support/page")).default
    render(<Page />)

    expect(await screen.findByText(/No tienes incidencias registradas/i)).toBeInTheDocument()
    expect(await screen.findByText(/No tienes devoluciones registradas/i)).toBeInTheDocument()
  })
})
