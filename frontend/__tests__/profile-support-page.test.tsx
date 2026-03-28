import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"

const listMyIncidentsMock = vi.fn()
const getMyRefundsMock = vi.fn()
const toastMock = vi.fn()

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

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({
    toast: (...args: unknown[]) => toastMock(...args),
  }),
}))

describe("Profile support page", () => {
  beforeEach(() => {
    listMyIncidentsMock.mockReset()
    getMyRefundsMock.mockReset()
    toastMock.mockReset()
  })

  it("renders the client-wide support inbox with direct order actions", async () => {
    listMyIncidentsMock.mockResolvedValue([
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
    getMyRefundsMock.mockResolvedValue([
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
    expect(screen.getAllByText("1")).toHaveLength(2)
    expect(screen.getByRole("link", { name: "Seguir pedido" })).toHaveAttribute(
      "href",
      "/orders/order-1/track",
    )
    expect(screen.getByRole("link", { name: "Ir al soporte del pedido" })).toHaveAttribute(
      "href",
      "/orders/order-2/track",
    )
    expect(listMyIncidentsMock).toHaveBeenCalled()
    expect(getMyRefundsMock).toHaveBeenCalled()
  })

  it("shows the empty states when the client has no support cases", async () => {
    listMyIncidentsMock.mockResolvedValue([])
    getMyRefundsMock.mockResolvedValue([])

    const Page = (await import("@/app/[locale]/profile/support/page")).default
    render(<Page />)

    expect(await screen.findByText(/No tienes incidencias registradas/i)).toBeInTheDocument()
    expect(await screen.findByText(/No tienes devoluciones registradas/i)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Ir al centro de pedidos/i })).toHaveAttribute(
      "href",
      "/orders",
    )
  })

  it("degrades safely to empty data when support services fail", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    listMyIncidentsMock.mockRejectedValue(new Error("offline"))
    getMyRefundsMock.mockRejectedValue(new Error("offline"))

    const Page = (await import("@/app/[locale]/profile/support/page")).default
    render(<Page />)

    expect(await screen.findByText(/No tienes incidencias registradas/i)).toBeInTheDocument()
    expect(screen.getByText(/No tienes devoluciones registradas/i)).toBeInTheDocument()
    expect(
      screen.getByText(/Tu centro de soporte no se pudo cargar correctamente/i),
    ).toBeInTheDocument()
    expect(toastMock).toHaveBeenCalledWith({
      title: "Error",
      description: "No se pudo cargar tu centro de soporte.",
      variant: "destructive",
    })
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it("hides direct order actions when a case is not linked to a root order", async () => {
    listMyIncidentsMock.mockResolvedValue([
      {
        id: "incident-2",
        orderId: null,
        deliveryOrderId: "delivery-2",
        reporterRole: "CLIENT",
        type: "OTHER",
        status: "RESOLVED",
        description: "Consulta ya cerrada",
        evidenceUrl: null,
        createdAt: "2026-03-27T10:00:00.000Z",
        resolvedAt: "2026-03-27T11:00:00.000Z",
      },
    ])
    getMyRefundsMock.mockResolvedValue([
      {
        id: "refund-2",
        orderId: null,
        incidentId: null,
        providerOrderId: null,
        deliveryOrderId: "delivery-2",
        type: "DELIVERY_PARTIAL",
        status: "COMPLETED",
        amount: 3.5,
        currency: "EUR",
        requestedById: "client-1",
        reviewedById: "admin-1",
        externalRefundId: null,
        createdAt: "2026-03-27T11:00:00.000Z",
        reviewedAt: "2026-03-27T11:30:00.000Z",
        completedAt: "2026-03-27T12:00:00.000Z",
      },
    ])

    const Page = (await import("@/app/[locale]/profile/support/page")).default
    render(<Page />)

    const incidentTitle = await screen.findByText("Consulta ya cerrada")
    const refundAmount = await screen.findByText("3,50 €")
    const incidentCard = incidentTitle.closest("article")
    const refundCard = refundAmount.closest("article")

    expect(incidentCard).not.toBeNull()
    expect(refundCard).not.toBeNull()
    expect(
      within(incidentCard as HTMLElement).getByText(/Estado:\s*Resuelta/i),
    ).toBeInTheDocument()
    expect(
      within(refundCard as HTMLElement).getByText(/Estado:\s*Completada/i),
    ).toBeInTheDocument()
    expect(
      within(incidentCard as HTMLElement).queryByRole("link", { name: "Seguir pedido" }),
    ).not.toBeInTheDocument()
    expect(
      within(refundCard as HTMLElement).queryByRole("link", {
        name: "Ir al soporte del pedido",
      }),
    ).not.toBeInTheDocument()
  })

  it("computes open and closed case counters across incidents and refunds", async () => {
    listMyIncidentsMock.mockResolvedValue([
      {
        id: "incident-open",
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
      {
        id: "incident-closed",
        orderId: "order-2",
        deliveryOrderId: "delivery-2",
        reporterRole: "CLIENT",
        type: "OTHER",
        status: "RESOLVED",
        description: "Consulta cerrada",
        evidenceUrl: null,
        createdAt: "2026-03-27T10:30:00.000Z",
        resolvedAt: "2026-03-27T11:00:00.000Z",
      },
    ])
    getMyRefundsMock.mockResolvedValue([
      {
        id: "refund-open",
        orderId: "order-1",
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
      {
        id: "refund-closed",
        orderId: "order-2",
        incidentId: null,
        providerOrderId: null,
        deliveryOrderId: "delivery-2",
        type: "DELIVERY_PARTIAL",
        status: "COMPLETED",
        amount: 3.5,
        currency: "EUR",
        requestedById: "client-1",
        reviewedById: "admin-1",
        externalRefundId: null,
        createdAt: "2026-03-27T11:15:00.000Z",
        reviewedAt: "2026-03-27T11:30:00.000Z",
        completedAt: "2026-03-27T12:00:00.000Z",
      },
    ])

    const Page = (await import("@/app/[locale]/profile/support/page")).default
    render(<Page />)

    expect(await screen.findByText("Soporte y devoluciones")).toBeInTheDocument()
    expect(screen.getByText("Incidencias abiertas")).toBeInTheDocument()
    expect(screen.getByText("Devoluciones activas")).toBeInTheDocument()
    expect(screen.getByText("Casos cerrados")).toBeInTheDocument()
    expect(screen.getAllByText("1")).toHaveLength(2)
    expect(screen.getByText("2")).toBeInTheDocument()
  })

  it("falls back to empty collections when support services return non-array payloads", async () => {
    listMyIncidentsMock.mockResolvedValue(undefined)
    getMyRefundsMock.mockResolvedValue(null)

    const Page = (await import("@/app/[locale]/profile/support/page")).default
    render(<Page />)

    expect(await screen.findByText(/No tienes incidencias registradas/i)).toBeInTheDocument()
    expect(screen.getByText(/No tienes devoluciones registradas/i)).toBeInTheDocument()
    expect(toastMock).not.toHaveBeenCalled()
  })

  it("renders additional incident and refund labels for less common support cases", async () => {
    listMyIncidentsMock.mockResolvedValue([
      {
        id: "incident-address",
        orderId: "order-3",
        deliveryOrderId: "delivery-3",
        reporterRole: "CLIENT",
        type: "ADDRESS_PROBLEM",
        status: "REJECTED",
        description: "La dirección era incorrecta",
        evidenceUrl: null,
        createdAt: "2026-03-27T10:00:00.000Z",
        resolvedAt: null,
      },
      {
        id: "incident-safety",
        orderId: "order-4",
        deliveryOrderId: "delivery-4",
        reporterRole: "CLIENT",
        type: "SAFETY_CONCERN",
        status: "UNDER_REVIEW",
        description: "Incidencia de seguridad",
        evidenceUrl: null,
        createdAt: "2026-03-27T10:30:00.000Z",
        resolvedAt: null,
      },
      {
        id: "incident-wrong",
        orderId: "order-5",
        deliveryOrderId: "delivery-5",
        reporterRole: "CLIENT",
        type: "WRONG_DELIVERY",
        status: "OPEN",
        description: "Pedido incorrecto",
        evidenceUrl: null,
        createdAt: "2026-03-27T11:00:00.000Z",
        resolvedAt: null,
      },
    ])
    getMyRefundsMock.mockResolvedValue([
      {
        id: "refund-provider-full",
        orderId: "order-3",
        incidentId: null,
        providerOrderId: "provider-order-3",
        deliveryOrderId: null,
        type: "PROVIDER_FULL",
        status: "APPROVED",
        amount: 20,
        currency: "EUR",
        requestedById: "client-1",
        reviewedById: "admin-1",
        externalRefundId: null,
        createdAt: "2026-03-27T11:10:00.000Z",
        reviewedAt: "2026-03-27T11:20:00.000Z",
        completedAt: null,
      },
      {
        id: "refund-delivery-full",
        orderId: "order-4",
        incidentId: null,
        providerOrderId: null,
        deliveryOrderId: "delivery-4",
        type: "DELIVERY_FULL",
        status: "FAILED",
        amount: 5,
        currency: "EUR",
        requestedById: "client-1",
        reviewedById: "admin-1",
        externalRefundId: null,
        createdAt: "2026-03-27T11:30:00.000Z",
        reviewedAt: "2026-03-27T11:40:00.000Z",
        completedAt: null,
      },
      {
        id: "refund-executing",
        orderId: "order-5",
        incidentId: null,
        providerOrderId: null,
        deliveryOrderId: "delivery-5",
        type: "DELIVERY_PARTIAL",
        status: "EXECUTING",
        amount: 3,
        currency: "EUR",
        requestedById: "client-1",
        reviewedById: "admin-1",
        externalRefundId: null,
        createdAt: "2026-03-27T11:50:00.000Z",
        reviewedAt: "2026-03-27T12:00:00.000Z",
        completedAt: null,
      },
    ])

    const Page = (await import("@/app/[locale]/profile/support/page")).default
    render(<Page />)

    expect(await screen.findByText("Soporte y devoluciones")).toBeInTheDocument()
    expect(screen.getByText("Problema con la dirección")).toBeInTheDocument()
    expect(screen.getAllByText("Incidencia de seguridad").length).toBeGreaterThan(0)
    expect(screen.getByText("Entrega incorrecta")).toBeInTheDocument()
    expect(screen.getByText(/Estado:\s*Rechazada/i)).toBeInTheDocument()
    expect(screen.getByText("Devolución completa de comercio")).toBeInTheDocument()
    expect(screen.getByText("Devolución completa de reparto")).toBeInTheDocument()
    expect(screen.getByText(/Estado:\s*Aprobada/i)).toBeInTheDocument()
    expect(screen.getByText(/Estado:\s*Fallida/i)).toBeInTheDocument()
    expect(screen.getByText(/Estado:\s*Ejecutándose/i)).toBeInTheDocument()
  })
})
