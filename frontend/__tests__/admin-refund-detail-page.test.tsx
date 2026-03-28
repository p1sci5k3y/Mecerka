import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

const getRefundMock = vi.fn()
const reviewRefundMock = vi.fn()
const approveRefundMock = vi.fn()
const rejectRefundMock = vi.fn()
const executeRefundMock = vi.fn()
const toastMock = vi.fn()

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "refund-1" }),
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
    getRefund: (...args: unknown[]) => getRefundMock(...args),
    reviewRefund: (...args: unknown[]) => reviewRefundMock(...args),
    approveRefund: (...args: unknown[]) => approveRefundMock(...args),
    rejectRefund: (...args: unknown[]) => rejectRefundMock(...args),
    executeRefund: (...args: unknown[]) => executeRefundMock(...args),
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

const refund = {
  id: "refund-1",
  incidentId: null,
  providerOrderId: "provider-order-1",
  deliveryOrderId: null,
  orderId: "order-1",
  type: "PROVIDER_PARTIAL",
  status: "UNDER_REVIEW",
  amount: 12.5,
  currency: "EUR",
  requestedById: "client-1",
  reviewedById: null,
  externalRefundId: null,
  createdAt: "2026-03-27T10:00:00.000Z",
  reviewedAt: null,
  completedAt: null,
  requestedByEmail: "client@example.com",
  requestedByName: "Client Demo",
  reviewedByEmail: null,
  reviewedByName: null,
}

const requestedRefund = {
  ...refund,
  id: "refund-requested",
  status: "REQUESTED",
}

const approvedRefund = {
  ...refund,
  id: "refund-approved",
  status: "APPROVED",
  deliveryOrderId: "delivery-order-1",
}

describe("Admin refund detail page", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders the refund case with contextual action buttons", async () => {
    getRefundMock.mockResolvedValue(refund)

    const Page = (await import("@/app/[locale]/admin/refunds/[id]/page")).default
    render(<Page />)

    expect(await screen.findByText("Caso de devolución")).toBeInTheDocument()
    expect(screen.getByText("Siguiente acción de backoffice")).toBeInTheDocument()
    expect(screen.getByText("Resolver decisión económica")).toBeInTheDocument()
    expect(screen.getByText("Comercio provider-order-1")).toBeInTheDocument()
    expect(screen.getByText("Client Demo")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Ver pedido cliente/i })).toHaveAttribute(
      "href",
      "/orders/order-1",
    )
    expect(screen.getByRole("link", { name: /Ver venta de comercio/i })).toHaveAttribute(
      "href",
      "/provider/sales/provider-order-1",
    )
    expect(screen.getByRole("button", { name: /Aprobar/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Rechazar/i })).toBeInTheDocument()
  })

  it("executes case actions and reloads the refund detail", async () => {
    getRefundMock.mockResolvedValue(refund)
    approveRefundMock.mockResolvedValue({})

    const Page = (await import("@/app/[locale]/admin/refunds/[id]/page")).default
    render(<Page />)

    expect(await screen.findByText("Caso de devolución")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Aprobar/i }))

    await waitFor(() => {
      expect(approveRefundMock).toHaveBeenCalledWith("refund-1")
      expect(toastMock).toHaveBeenCalledWith({ title: "Devolución aprobada" })
    })
  })

  it("routes delivery refunds to the runner order hub and supports review/execution paths", async () => {
    getRefundMock
      .mockResolvedValueOnce(requestedRefund)
      .mockResolvedValueOnce(approvedRefund)
      .mockResolvedValueOnce(approvedRefund)
      .mockRejectedValueOnce(new Error("missing"))
    reviewRefundMock.mockResolvedValueOnce({})
    executeRefundMock.mockResolvedValueOnce({})

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const Page = (await import("@/app/[locale]/admin/refunds/[id]/page")).default
    const { unmount } = render(<Page />)

    expect(await screen.findByText("Caso de devolución")).toBeInTheDocument()
    expect(screen.getByText("Abrir revisión del caso")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Revisar/i }))

    await waitFor(() => {
      expect(reviewRefundMock).toHaveBeenCalledWith("refund-requested")
      expect(toastMock).toHaveBeenCalledWith({ title: "Devolución puesta en revisión" })
    })

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /Ver entrega de reparto/i })).toHaveAttribute(
        "href",
        "/runner/orders/order-1",
      )
    })

    fireEvent.click(screen.getByRole("button", { name: /Ejecutar/i }))
    await waitFor(() => {
      expect(executeRefundMock).toHaveBeenCalledWith("refund-approved")
      expect(toastMock).toHaveBeenCalledWith({ title: "Devolución ejecutada" })
    })

    unmount()
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText(/No pudimos cargar este caso de devolución/i)).toBeInTheDocument()
    })

    consoleErrorSpy.mockRestore()
  })

  it("shows a safe fallback when the refund has no extra context links", async () => {
    getRefundMock.mockResolvedValue({
      ...refund,
      providerOrderId: null,
      deliveryOrderId: null,
      orderId: null,
      incidentId: null,
    })

    const Page = (await import("@/app/[locale]/admin/refunds/[id]/page")).default
    render(<Page />)

    expect(await screen.findByText("Caso de devolución")).toBeInTheDocument()
    expect(
      screen.getByText(/Este caso no expone saltos de contexto adicionales/i),
    ).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /Ver pedido cliente/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /Ver venta de comercio/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /Ver entrega de reparto/i })).not.toBeInTheDocument()
  })

  it("surfaces failed refunds as an escalation path", async () => {
    getRefundMock.mockResolvedValue({
      ...refund,
      status: "FAILED",
      externalRefundId: "re_123",
    })

    const Page = (await import("@/app/[locale]/admin/refunds/[id]/page")).default
    render(<Page />)

    expect(await screen.findByText("Caso de devolución")).toBeInTheDocument()
    expect(screen.getByText("Siguiente acción de backoffice")).toBeInTheDocument()
    expect(screen.getByText("Revisar fallo de devolución")).toBeInTheDocument()
  })
})
