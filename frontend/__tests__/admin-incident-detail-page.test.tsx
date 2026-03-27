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

describe("Admin incident detail page", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders the incident case with operational context", async () => {
    getIncidentMock.mockResolvedValue(incident)

    const Page = (await import("@/app/[locale]/admin/incidents/[id]/page")).default
    render(<Page />)

    expect(await screen.findByText("Caso de incidencia")).toBeInTheDocument()
    expect(screen.getByText("delivery-order-1")).toBeInTheDocument()
    expect(screen.getByText("Runner Demo")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Ver pedido cliente/i })).toHaveAttribute(
      "href",
      "/orders/order-7",
    )
    expect(screen.getByRole("link", { name: /Ver entrega de reparto/i })).toHaveAttribute(
      "href",
      "/runner/orders/delivery-order-1",
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
})
