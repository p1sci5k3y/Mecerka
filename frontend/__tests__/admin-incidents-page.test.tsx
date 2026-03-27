import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

const getIncidentsMock = vi.fn()
const reviewIncidentMock = vi.fn()
const resolveIncidentMock = vi.fn()
const rejectIncidentMock = vi.fn()
const toastMock = vi.fn()

vi.mock("@/lib/services/admin-service", () => ({
  adminService: {
    getIncidents: (...args: unknown[]) => getIncidentsMock(...args),
    reviewIncident: (...args: unknown[]) => reviewIncidentMock(...args),
    resolveIncident: (...args: unknown[]) => resolveIncidentMock(...args),
    rejectIncident: (...args: unknown[]) => rejectIncidentMock(...args),
  },
}))

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({
    toast: (...args: unknown[]) => toastMock(...args),
  }),
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, asChild, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) =>
    asChild ? <>{children}</> : <button {...rest}>{children}</button>,
}))

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

vi.mock("@/components/ui/table", () => ({
  Table: ({ children }: { children: React.ReactNode }) => <table>{children}</table>,
  TableHeader: ({ children }: { children: React.ReactNode }) => <thead>{children}</thead>,
  TableBody: ({ children }: { children: React.ReactNode }) => <tbody>{children}</tbody>,
  TableRow: ({ children }: { children: React.ReactNode }) => <tr>{children}</tr>,
  TableHead: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <th className={className}>{children}</th>
  ),
  TableCell: ({
    children,
    className,
    colSpan,
  }: {
    children: React.ReactNode
    className?: string
    colSpan?: number
  }) => (
    <td className={className} colSpan={colSpan}>
      {children}
    </td>
  ),
}))

const openIncident = {
  id: "incident-open",
  deliveryOrderId: "delivery-order-1",
  reporterId: "client-1",
  reporterRole: "CLIENT",
  type: "FAILED_DELIVERY",
  status: "OPEN",
  description: "El pedido no llegó al cliente",
  evidenceUrl: "https://example.com/evidence.jpg",
  createdAt: "2026-03-27T10:00:00.000Z",
  resolvedAt: null,
  reporterEmail: "client@example.com",
  reporterName: "Client Demo",
}

const reviewIncident = {
  ...openIncident,
  id: "incident-review",
  status: "UNDER_REVIEW",
  reporterRole: "RUNNER",
  reporterEmail: "runner@example.com",
  reporterName: "Runner Demo",
}

describe("Admin incidents page", () => {
  beforeEach(() => {
    getIncidentsMock.mockReset()
    reviewIncidentMock.mockReset()
    resolveIncidentMock.mockReset()
    rejectIncidentMock.mockReset()
    toastMock.mockReset()
  })

  it("loads incidents, shows queue data and moves an open incident to review", async () => {
    getIncidentsMock
      .mockResolvedValueOnce([openIncident, reviewIncident])
      .mockResolvedValueOnce([{ ...openIncident, status: "UNDER_REVIEW" }])
    reviewIncidentMock.mockResolvedValueOnce({ ...openIncident, status: "UNDER_REVIEW" })

    const Page = (await import("@/app/[locale]/admin/incidents/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("Incidencias")).toBeInTheDocument()
    })

    expect(screen.getByRole("button", { name: "Abiertas" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "En revisión" })).toBeInTheDocument()
    expect(screen.getAllByText(/Entrega delivery-order-1/i)).toHaveLength(2)
    expect(screen.getAllByRole("link", { name: /Ver evidencia/i })).toHaveLength(2)
    expect(screen.getAllByRole("link", { name: /Ver evidencia/i })[0]).toHaveAttribute(
      "href",
      "https://example.com/evidence.jpg",
    )

    fireEvent.click(screen.getByRole("button", { name: "Revisar" }))

    await waitFor(() => {
      expect(reviewIncidentMock).toHaveBeenCalledWith("incident-open")
      expect(toastMock).toHaveBeenCalledWith({ title: "Incidencia puesta en revisión" })
    })
  })

  it("allows resolving and rejecting incidents under review", async () => {
    getIncidentsMock.mockResolvedValue([reviewIncident])
    resolveIncidentMock.mockResolvedValueOnce({ ...reviewIncident, status: "RESOLVED" })
    rejectIncidentMock.mockResolvedValueOnce({ ...reviewIncident, status: "REJECTED" })

    const Page = (await import("@/app/[locale]/admin/incidents/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("Runner Demo")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: "Resolver" }))
    await waitFor(() => {
      expect(resolveIncidentMock).toHaveBeenCalledWith("incident-review")
    })

    fireEvent.click(screen.getByRole("button", { name: "Rechazar" }))
    await waitFor(() => {
      expect(rejectIncidentMock).toHaveBeenCalledWith("incident-review")
    })
  })

  it("surfaces load errors and keeps the empty state visible", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    getIncidentsMock.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([])

    const Page = (await import("@/app/[locale]/admin/incidents/page")).default
    const { unmount } = render(<Page />)

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        title: "Error",
        description: "No se pudieron cargar las incidencias",
        variant: "destructive",
      })
    })

    unmount()
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("No hay incidencias en este estado.")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: "Resueltas" }))
    expect(screen.getByText("No hay incidencias en este estado.")).toBeInTheDocument()
    consoleErrorSpy.mockRestore()
  })
})
