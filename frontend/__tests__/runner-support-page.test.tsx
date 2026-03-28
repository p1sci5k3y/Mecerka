import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { Order } from "@/lib/types"

const getAllMock = vi.fn()
const listDeliveryOrderIncidentsMock = vi.fn()
const getDeliveryOrderRefundsMock = vi.fn()
const createIncidentMock = vi.fn()
const toastMock = vi.fn()

vi.mock("@/lib/services/orders-service", () => ({
  ordersService: {
    getAll: (...args: unknown[]) => getAllMock(...args),
  },
}))

vi.mock("@/lib/services/delivery-incidents-service", () => ({
  deliveryIncidentsService: {
    listDeliveryOrderIncidents: (...args: unknown[]) => listDeliveryOrderIncidentsMock(...args),
    createIncident: (...args: unknown[]) => createIncidentMock(...args),
  },
}))

vi.mock("@/lib/services/refunds-service", () => ({
  refundsService: {
    getDeliveryOrderRefunds: (...args: unknown[]) => getDeliveryOrderRefundsMock(...args),
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

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({
    toast: (...args: unknown[]) => toastMock(...args),
  }),
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

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    userId: "client-1",
    total: 48,
    deliveryFee: 4.5,
    status: "DELIVERED",
    createdAt: "2026-03-24T10:00:00.000Z",
    updatedAt: "2026-03-24T11:00:00.000Z",
    items: [],
    providerOrders: [],
    deliveryOrder: {
      id: "delivery-1",
      runnerId: "runner-1",
      status: "DELIVERED",
      paymentStatus: "PAID",
    },
    ...overrides,
  }
}

describe("Runner support page", () => {
  beforeEach(() => {
    getAllMock.mockReset()
    listDeliveryOrderIncidentsMock.mockReset()
    getDeliveryOrderRefundsMock.mockReset()
    createIncidentMock.mockReset()
    toastMock.mockReset()
  })

  it("lists runner deliveries with visible incidents and refunds", async () => {
    getAllMock.mockResolvedValue([makeOrder()])
    listDeliveryOrderIncidentsMock.mockResolvedValue([
      {
        id: "incident-1",
        deliveryOrderId: "delivery-1",
        reporterRole: "CLIENT",
        type: "FAILED_DELIVERY",
        status: "UNDER_REVIEW",
        description: "Entrega retrasada",
        evidenceUrl: null,
        createdAt: "2026-03-24T12:00:00.000Z",
        resolvedAt: null,
      },
    ])
    getDeliveryOrderRefundsMock.mockResolvedValue([
      {
        id: "refund-1",
        incidentId: "incident-1",
        providerOrderId: null,
        deliveryOrderId: "delivery-1",
        type: "DELIVERY_PARTIAL",
        status: "REQUESTED",
        amount: 2,
        currency: "EUR",
        requestedById: "client-1",
        reviewedById: null,
        externalRefundId: null,
        createdAt: "2026-03-24T12:10:00.000Z",
        reviewedAt: null,
        completedAt: null,
      },
    ])

    const Page = (await import("@/app/[locale]/runner/support/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("Centro de soporte del runner")).toBeInTheDocument()
    })

    expect(screen.getByText("Entregas con soporte")).toBeInTheDocument()
    expect(screen.getAllByText("Pedido #ORDER-1").length).toBeGreaterThan(0)
    expect(screen.getByText("DELIVERY_PARTIAL · Solicitada")).toBeInTheDocument()
    expect(screen.getByText("FAILED_DELIVERY · En revisión")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Ver ficha operativa/i })).toHaveAttribute(
      "href",
      "/runner/orders/order-1",
    )
    expect(getAllMock).toHaveBeenCalled()
    expect(listDeliveryOrderIncidentsMock).toHaveBeenCalledWith("delivery-1")
    expect(getDeliveryOrderRefundsMock).toHaveBeenCalledWith("delivery-1")
  })

  it("shows an empty state when there are no visible support cases for the runner", async () => {
    getAllMock.mockResolvedValue([makeOrder()])
    listDeliveryOrderIncidentsMock.mockResolvedValue([])
    getDeliveryOrderRefundsMock.mockResolvedValue([])

    const Page = (await import("@/app/[locale]/runner/support/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("Centro de soporte del runner")).toBeInTheDocument()
    })

    expect(
      screen.getByText(/No hay incidencias ni devoluciones visibles en tus entregas ahora mismo/i),
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Abrir finanzas/i })).toHaveAttribute(
      "href",
      "/runner/finance",
    )
  })

  it("lets the runner open an incident from the support hub", async () => {
    getAllMock.mockResolvedValue([makeOrder()])
    listDeliveryOrderIncidentsMock.mockResolvedValue([])
    getDeliveryOrderRefundsMock.mockResolvedValue([])
    createIncidentMock.mockResolvedValue({
      id: "incident-new",
      deliveryOrderId: "delivery-1",
      reporterRole: "RUNNER",
      type: "FAILED_DELIVERY",
      status: "OPEN",
      description: "Cliente ausente en la entrega",
      evidenceUrl: null,
      createdAt: "2026-03-27T12:00:00.000Z",
      resolvedAt: null,
    })

    const Page = (await import("@/app/[locale]/runner/support/page")).default
    render(<Page />)

    await screen.findByText("Abrir incidencia operativa")

    fireEvent.change(
      screen.getByPlaceholderText(/Describe la incidencia detectada en la entrega/i),
      { target: { value: "Cliente ausente en la entrega" } },
    )
    fireEvent.change(screen.getByPlaceholderText("https://..."), {
      target: { value: " https://evidence.example.com/delivery.jpg " },
    })
    fireEvent.click(screen.getByRole("button", { name: /Registrar incidencia/i }))

    await waitFor(() => {
      expect(createIncidentMock).toHaveBeenCalledWith({
        deliveryOrderId: "delivery-1",
        type: "FAILED_DELIVERY",
        description: "Cliente ausente en la entrega",
        evidenceUrl: "https://evidence.example.com/delivery.jpg",
      })
    })
    expect(toastMock).toHaveBeenCalled()
  })

  it("requires a meaningful incident description before enabling submit", async () => {
    getAllMock.mockResolvedValue([makeOrder()])
    listDeliveryOrderIncidentsMock.mockResolvedValue([])
    getDeliveryOrderRefundsMock.mockResolvedValue([])

    const Page = (await import("@/app/[locale]/runner/support/page")).default
    render(<Page />)

    const submitButton = await screen.findByRole("button", { name: /Registrar incidencia/i })
    expect(submitButton).toBeDisabled()

    fireEvent.change(
      screen.getByPlaceholderText(/Describe la incidencia detectada en la entrega/i),
      { target: { value: "abc" } },
    )
    expect(submitButton).toBeDisabled()

    fireEvent.change(
      screen.getByPlaceholderText(/Describe la incidencia detectada en la entrega/i),
      { target: { value: "Cliente ausente y teléfono apagado" } },
    )
    expect(submitButton).toBeEnabled()
  })

  it("degrades safely when the main runner support load fails", async () => {
    getAllMock.mockRejectedValue(new Error("runner support down"))

    const Page = (await import("@/app/[locale]/runner/support/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("Centro de soporte del runner")).toBeInTheDocument()
    })

    expect(
      screen.getByText(/No hay entregas con reparto asociado sobre las que abrir incidencias/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/No hay incidencias ni devoluciones visibles en tus entregas ahora mismo/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Estamos mostrando el estado seguro vacío mientras el servicio se recupera/i),
    ).toBeInTheDocument()
    expect(listDeliveryOrderIncidentsMock).not.toHaveBeenCalled()
    expect(getDeliveryOrderRefundsMock).not.toHaveBeenCalled()
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Error",
        variant: "destructive",
      }),
    )
  })

  it("keeps the incident draft visible and shows an error toast when runner incident creation fails", async () => {
    createIncidentMock.mockRejectedValueOnce(new Error("submit failed"))
    getAllMock.mockResolvedValue([makeOrder()])
    listDeliveryOrderIncidentsMock.mockResolvedValue([])
    getDeliveryOrderRefundsMock.mockResolvedValue([])

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const Page = (await import("@/app/[locale]/runner/support/page")).default
    render(<Page />)

    fireEvent.change(
      await screen.findByPlaceholderText(/Describe la incidencia detectada en la entrega/i),
      { target: { value: "Cliente ausente y sin respuesta" } },
    )
    fireEvent.click(screen.getByRole("button", { name: /Registrar incidencia/i }))

    await waitFor(() => {
      expect(createIncidentMock).toHaveBeenCalledTimes(1)
    })

    expect(screen.getByDisplayValue("Cliente ausente y sin respuesta")).toBeInTheDocument()
    expect(toastMock).toHaveBeenCalledWith({
      title: "Error",
      description: "No se pudo registrar la incidencia del runner.",
      variant: "destructive",
    })
    errorSpy.mockRestore()
  })

  it("falls back to empty support collections when runner secondary services return non-array payloads", async () => {
    getAllMock.mockResolvedValueOnce([makeOrder()])
    listDeliveryOrderIncidentsMock.mockResolvedValueOnce({ invalid: true })
    getDeliveryOrderRefundsMock.mockResolvedValueOnce(null)

    const Page = (await import("@/app/[locale]/runner/support/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("Centro de soporte del runner")).toBeInTheDocument()
    })

    expect(
      screen.getByText(/No hay incidencias ni devoluciones visibles en tus entregas ahora mismo/i),
    ).toBeInTheDocument()
    expect(toastMock).not.toHaveBeenCalled()
  })

  it("renders unknown runner support statuses as a safe fallback label", async () => {
    getAllMock.mockResolvedValue([makeOrder()])
    listDeliveryOrderIncidentsMock.mockResolvedValue([
      {
        id: "incident-1",
        deliveryOrderId: "delivery-1",
        reporterRole: "CLIENT",
        type: "FAILED_DELIVERY",
        status: "UNKNOWN_STATUS" as never,
        description: "Entrega retrasada",
        evidenceUrl: null,
        createdAt: "2026-03-24T12:00:00.000Z",
        resolvedAt: null,
      },
    ])
    getDeliveryOrderRefundsMock.mockResolvedValue([
      {
        id: "refund-1",
        incidentId: "incident-1",
        providerOrderId: null,
        deliveryOrderId: "delivery-1",
        type: "DELIVERY_PARTIAL",
        status: "UNKNOWN_STATUS",
        amount: 2,
        currency: "EUR",
        requestedById: "client-1",
        reviewedById: null,
        externalRefundId: null,
        createdAt: "2026-03-24T12:10:00.000Z",
        reviewedAt: null,
        completedAt: null,
      },
    ])

    const Page = (await import("@/app/[locale]/runner/support/page")).default
    render(<Page />)

    expect(await screen.findByText("Centro de soporte del runner")).toBeInTheDocument()
    expect(screen.getAllByText(/Sin estado/i).length).toBeGreaterThan(0)
  })

  it("submits a runner incident without evidence and keeps the selected delivery after reload", async () => {
    const secondOrder = makeOrder({
      id: "order-2",
      deliveryOrder: {
        id: "delivery-2",
        runnerId: "runner-1",
        status: "ASSIGNED",
        paymentStatus: "PAYMENT_PENDING",
      },
    })

    getAllMock.mockResolvedValue([makeOrder(), secondOrder])
    listDeliveryOrderIncidentsMock.mockResolvedValue([])
    getDeliveryOrderRefundsMock.mockResolvedValue([])
    createIncidentMock.mockResolvedValue({
      id: "incident-new",
      deliveryOrderId: "delivery-2",
      reporterRole: "RUNNER",
      type: "FAILED_DELIVERY",
      status: "OPEN",
      description: "No contesta el cliente",
      evidenceUrl: null,
      createdAt: "2026-03-27T12:00:00.000Z",
      resolvedAt: null,
    })

    const Page = (await import("@/app/[locale]/runner/support/page")).default
    render(<Page />)

    const [deliverySelect] = await screen.findAllByRole("combobox")
    fireEvent.change(deliverySelect, { target: { value: "order-2" } })
    fireEvent.change(screen.getByPlaceholderText(/Describe la incidencia detectada en la entrega/i), {
      target: { value: "No contesta el cliente" },
    })
    fireEvent.click(screen.getByRole("button", { name: /Registrar incidencia/i }))

    await waitFor(() => {
      expect(createIncidentMock).toHaveBeenCalledWith({
        deliveryOrderId: "delivery-2",
        type: "FAILED_DELIVERY",
        description: "No contesta el cliente",
      })
    })

    expect(createIncidentMock.mock.calls[0]?.[0]).not.toHaveProperty("evidenceUrl")
    await waitFor(() => {
      expect((screen.getAllByRole("combobox")[0] as HTMLSelectElement).value).toBe("order-2")
    })
  })

  it("covers remaining runner support labels and empty subcards", async () => {
    getAllMock.mockResolvedValue([
      makeOrder(),
      makeOrder({
        id: "order-2",
        deliveryOrder: {
          id: "delivery-2",
          runnerId: "runner-1",
          status: "DELIVERED",
          paymentStatus: "PAID",
        },
      }),
    ])
    listDeliveryOrderIncidentsMock.mockImplementation(async (deliveryOrderId: string) => {
      if (deliveryOrderId === "delivery-2") {
        return [
          { id: "incident-1", deliveryOrderId, reporterRole: "CLIENT", type: "FAILED_DELIVERY", status: "OPEN", description: "Caso 1", evidenceUrl: null, createdAt: "2026-03-24T12:00:00.000Z", resolvedAt: null },
          { id: "incident-2", deliveryOrderId, reporterRole: "CLIENT", type: "FAILED_DELIVERY", status: "RESOLVED", description: "Caso 2", evidenceUrl: null, createdAt: "2026-03-24T12:00:00.000Z", resolvedAt: null },
          { id: "incident-3", deliveryOrderId, reporterRole: "CLIENT", type: "FAILED_DELIVERY", status: "REJECTED", description: "Caso 3", evidenceUrl: null, createdAt: "2026-03-24T12:00:00.000Z", resolvedAt: null },
        ]
      }
      return []
    })
    getDeliveryOrderRefundsMock.mockImplementation(async (deliveryOrderId: string) => {
      if (deliveryOrderId === "delivery-1") {
        return [
          { id: "refund-1", incidentId: null, providerOrderId: null, deliveryOrderId, type: "DELIVERY_PARTIAL", status: "UNDER_REVIEW", amount: 1, currency: "EUR", requestedById: "client-1", reviewedById: null, externalRefundId: null, createdAt: "2026-03-24T12:10:00.000Z", reviewedAt: null, completedAt: null },
          { id: "refund-2", incidentId: null, providerOrderId: null, deliveryOrderId, type: "DELIVERY_PARTIAL", status: "APPROVED", amount: 2, currency: "EUR", requestedById: "client-1", reviewedById: null, externalRefundId: null, createdAt: "2026-03-24T12:10:00.000Z", reviewedAt: null, completedAt: null },
          { id: "refund-3", incidentId: null, providerOrderId: null, deliveryOrderId, type: "DELIVERY_PARTIAL", status: "REJECTED", amount: 3, currency: "EUR", requestedById: "client-1", reviewedById: null, externalRefundId: null, createdAt: "2026-03-24T12:10:00.000Z", reviewedAt: null, completedAt: null },
          { id: "refund-4", incidentId: null, providerOrderId: null, deliveryOrderId, type: "DELIVERY_PARTIAL", status: "EXECUTING", amount: 4, currency: "EUR", requestedById: "client-1", reviewedById: null, externalRefundId: null, createdAt: "2026-03-24T12:10:00.000Z", reviewedAt: null, completedAt: null },
          { id: "refund-5", incidentId: null, providerOrderId: null, deliveryOrderId, type: "DELIVERY_PARTIAL", status: "COMPLETED", amount: 5, currency: "EUR", requestedById: "client-1", reviewedById: null, externalRefundId: null, createdAt: "2026-03-24T12:10:00.000Z", reviewedAt: null, completedAt: null },
          { id: "refund-6", incidentId: null, providerOrderId: null, deliveryOrderId, type: "DELIVERY_PARTIAL", status: "FAILED", amount: 6, currency: "EUR", requestedById: "client-1", reviewedById: null, externalRefundId: null, createdAt: "2026-03-24T12:10:00.000Z", reviewedAt: null, completedAt: null },
        ]
      }
      return []
    })

    const Page = (await import("@/app/[locale]/runner/support/page")).default
    render(<Page />)

    expect(await screen.findByText("Centro de soporte del runner")).toBeInTheDocument()
    expect(screen.getByText("DELIVERY_PARTIAL · En revisión")).toBeInTheDocument()
    expect(screen.getByText("DELIVERY_PARTIAL · Aprobada")).toBeInTheDocument()
    expect(screen.getByText("DELIVERY_PARTIAL · Rechazada")).toBeInTheDocument()
    expect(screen.getByText("DELIVERY_PARTIAL · Ejecutando")).toBeInTheDocument()
    expect(screen.getByText("DELIVERY_PARTIAL · Completada")).toBeInTheDocument()
    expect(screen.getByText("DELIVERY_PARTIAL · Fallida")).toBeInTheDocument()
    expect(screen.getByText("FAILED_DELIVERY · Abierta")).toBeInTheDocument()
    expect(screen.getByText("FAILED_DELIVERY · Resuelta")).toBeInTheDocument()
    expect(screen.getByText("FAILED_DELIVERY · Rechazada")).toBeInTheDocument()
    expect(screen.getByText("Sin devoluciones visibles.")).toBeInTheDocument()
    expect(screen.getByText("Sin incidencias visibles.")).toBeInTheDocument()
  })
})
