import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

const getRefundsMock = vi.fn()
const reviewRefundMock = vi.fn()
const approveRefundMock = vi.fn()
const rejectRefundMock = vi.fn()
const executeRefundMock = vi.fn()
const toastMock = vi.fn()

vi.mock("@/lib/services/admin-service", () => ({
  adminService: {
    getRefunds: (...args: unknown[]) => getRefundsMock(...args),
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

const requestedRefund = {
  id: "refund-requested",
  incidentId: null,
  providerOrderId: "provider-order-1",
  deliveryOrderId: null,
  type: "PROVIDER_PARTIAL",
  status: "REQUESTED",
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

const underReviewRefund = {
  ...requestedRefund,
  id: "refund-review",
  status: "UNDER_REVIEW",
}

const approvedRefund = {
  ...requestedRefund,
  id: "refund-approved",
  status: "APPROVED",
}

describe("Admin refunds page", () => {
  beforeEach(() => {
    getRefundsMock.mockReset()
    reviewRefundMock.mockReset()
    approveRefundMock.mockReset()
    rejectRefundMock.mockReset()
    executeRefundMock.mockReset()
    toastMock.mockReset()
  })

  it("loads refunds, shows summary and sends a requested refund to review", async () => {
    getRefundsMock
      .mockResolvedValueOnce([requestedRefund, underReviewRefund, approvedRefund])
      .mockResolvedValueOnce([{ ...requestedRefund, status: "UNDER_REVIEW" }])
    reviewRefundMock.mockResolvedValueOnce({ ...requestedRefund, status: "UNDER_REVIEW" })

    const Page = (await import("@/app/[locale]/admin/refunds/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("Devoluciones")).toBeInTheDocument()
    })

    expect(screen.getByRole("button", { name: "Solicitadas" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "En revisión" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Aprobadas" })).toBeInTheDocument()
    expect(screen.getAllByText("Client Demo")).toHaveLength(3)
    expect(screen.getAllByText("Comercio provider-order-1")).toHaveLength(3)

    fireEvent.click(screen.getByRole("button", { name: "Revisar" }))

    await waitFor(() => {
      expect(reviewRefundMock).toHaveBeenCalledWith("refund-requested")
      expect(toastMock).toHaveBeenCalledWith({ title: "Devolución puesta en revisión" })
    })
  })

  it("allows approving, rejecting and executing refunds from the admin queue", async () => {
    getRefundsMock.mockResolvedValue([underReviewRefund, approvedRefund])
    approveRefundMock.mockResolvedValueOnce({ ...underReviewRefund, status: "APPROVED" })
    rejectRefundMock.mockResolvedValueOnce({ ...underReviewRefund, status: "REJECTED" })
    executeRefundMock.mockResolvedValueOnce({ ...approvedRefund, status: "COMPLETED" })

    const Page = (await import("@/app/[locale]/admin/refunds/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getAllByText("Client Demo")).toHaveLength(2)
    })

    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }))
    await waitFor(() => {
      expect(approveRefundMock).toHaveBeenCalledWith("refund-review")
    })

    fireEvent.click(screen.getByRole("button", { name: "Rechazar" }))
    await waitFor(() => {
      expect(rejectRefundMock).toHaveBeenCalledWith("refund-review")
    })

    fireEvent.click(screen.getByRole("button", { name: "Ejecutar" }))
    await waitFor(() => {
      expect(executeRefundMock).toHaveBeenCalledWith("refund-approved")
    })
  })

  it("surfaces load errors and shows the empty state for a filter without matches", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    getRefundsMock.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([])

    const Page = (await import("@/app/[locale]/admin/refunds/page")).default
    const { unmount } = render(<Page />)

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        title: "Error",
        description: "No se pudieron cargar las devoluciones",
        variant: "destructive",
      })
    })

    unmount()
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("No hay devoluciones en este estado.")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: "Completadas" }))
    expect(screen.getByText("No hay devoluciones en este estado.")).toBeInTheDocument()
    consoleErrorSpy.mockRestore()
  })
})
