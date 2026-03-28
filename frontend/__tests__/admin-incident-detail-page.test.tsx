import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

const getIncidentMock = vi.fn()
const reviewIncidentMock = vi.fn()
const resolveIncidentMock = vi.fn()
const rejectIncidentMock = vi.fn()
const toastMock = vi.fn()

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "incident-1" }),
}))

vi.mock("@/lib/navigation", () => ({
  Link: ({ href, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock("@/lib/services/admin-service", () => ({
  adminService: {
    getIncident: (...args: unknown[]) => getIncidentMock(...args),
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

const incident = {
  id: "incident-1",
  deliveryOrderId: "delivery-order-1",
  orderId: "order-7",
  reporterId: "runner-1",
  reporterRole: "RUNNER",
  type: "FAILED_DELIVERY",
  status: "UNDER_REVIEW",
  description: "No se pudo completar la entrega",
  evidenceUrl: "https://example.com/evidence.jpg",
  createdAt: "2026-03-27T10:00:00.000Z",
  resolvedAt: null,
  reporterEmail: "runner@example.com",
  reporterName: "Runner Demo",
}

const openIncident = {
  ...incident,
  id: "incident-open",
  status: "OPEN",
}

describe("Admin incident detail page", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders the incident case with operational context", async () => {
    getIncidentMock.mockResolvedValue(incident)

    const Page = (await import("@/app/[locale]/admin/incidents/[id]/page")).default
    render(<Page />)

    expect(await screen.findByText("Caso de incidencia")).toBeInTheDocument()
    expect(screen.getByText("Siguiente acción operativa")).toBeInTheDocument()
    expect(screen.getByText("Cerrar decisión del caso")).toBeInTheDocument()
    expect(screen.getByText("delivery-order-1")).toBeInTheDocument()
    expect(screen.getByText("Runner Demo")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Ver pedido cliente/i })).toHaveAttribute(
      "href",
      "/orders/order-7",
    )
    expect(screen.getByRole("link", { name: /Ver entrega de reparto/i })).toHaveAttribute(
      "href",
      "/runner/orders/order-7",
    )
    expect(screen.getByRole("link", { name: /Ver evidencia/i })).toHaveAttribute(
      "href",
      "https://example.com/evidence.jpg",
    )
  })

  it("executes incident actions and reloads the case", async () => {
    getIncidentMock.mockResolvedValue(incident)
    resolveIncidentMock.mockResolvedValue({})

    const Page = (await import("@/app/[locale]/admin/incidents/[id]/page")).default
    render(<Page />)

    expect(await screen.findByText("Caso de incidencia")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Resolver/i }))

    await waitFor(() => {
      expect(resolveIncidentMock).toHaveBeenCalledWith("incident-1")
      expect(toastMock).toHaveBeenCalledWith({ title: "Incidencia resuelta" })
    })
  })

  it("moves open incidents into review", async () => {
    getIncidentMock.mockResolvedValue(openIncident)
    reviewIncidentMock.mockResolvedValueOnce({})

    const Page = (await import("@/app/[locale]/admin/incidents/[id]/page")).default
    render(<Page />)

    expect(await screen.findByText("Caso de incidencia")).toBeInTheDocument()
    expect(screen.getByText("Abrir revisión operativa")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Revisar/i }))

    await waitFor(() => {
      expect(reviewIncidentMock).toHaveBeenCalledWith("incident-open")
      expect(toastMock).toHaveBeenCalledWith({ title: "Incidencia puesta en revisión" })
    })
  })

  it("shows the fallback state when the case cannot be loaded", async () => {
    getIncidentMock.mockRejectedValueOnce(new Error("gone"))

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const Page = (await import("@/app/[locale]/admin/incidents/[id]/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText(/No pudimos cargar este caso de incidencia/i)).toBeInTheDocument()
    })

    consoleErrorSpy.mockRestore()
  })

  it("shows safe fallbacks when the incident has no extra links or usable evidence", async () => {
    getIncidentMock.mockResolvedValue({
      ...incident,
      orderId: "",
      deliveryOrderId: "",
      evidenceUrl: "   ",
    })

    const Page = (await import("@/app/[locale]/admin/incidents/[id]/page")).default
    render(<Page />)

    expect(await screen.findByText("Caso de incidencia")).toBeInTheDocument()
    expect(
      screen.getByText(/Esta incidencia no tiene saltos de contexto adicionales/i),
    ).toBeInTheDocument()
    expect(screen.getByText("Sin evidencia adjunta")).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /Ver pedido cliente/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /Ver entrega de reparto/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /Ver evidencia/i })).not.toBeInTheDocument()
  })

  it("treats rejected incidents as closed operationally", async () => {
    getIncidentMock.mockResolvedValue({
      ...incident,
      status: "REJECTED",
    })

    const Page = (await import("@/app/[locale]/admin/incidents/[id]/page")).default
    render(<Page />)

    expect(await screen.findByText("Caso de incidencia")).toBeInTheDocument()
    expect(screen.getByText("Siguiente acción operativa")).toBeInTheDocument()
    expect(screen.getByText("Caso operativo cerrado sin continuidad")).toBeInTheDocument()
  })
})
