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

describe("Admin refund detail page", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders the refund case with contextual action buttons", async () => {
    getRefundMock.mockResolvedValue(refund)

    const Page = (await import("@/app/[locale]/admin/refunds/[id]/page")).default
    render(<Page />)

    expect(await screen.findByText("Caso de devolución")).toBeInTheDocument()
    expect(screen.getByText("Comercio provider-order-1")).toBeInTheDocument()
    expect(screen.getByText("Client Demo")).toBeInTheDocument()
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
})
