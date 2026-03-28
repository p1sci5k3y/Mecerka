import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { Order } from "@/lib/types"

const getAllMock = vi.fn()
const getProviderOrderRefundsMock = vi.fn()
const listDeliveryOrderIncidentsMock = vi.fn()
const createIncidentMock = vi.fn()
const useAuthMock = vi.fn()
const toastMock = vi.fn()

vi.mock("@/lib/services/orders-service", () => ({
  ordersService: {
    getAll: (...args: unknown[]) => getAllMock(...args),
  },
}))

vi.mock("@/lib/services/refunds-service", () => ({
  refundsService: {
    getProviderOrderRefunds: (...args: unknown[]) => getProviderOrderRefundsMock(...args),
  },
}))

vi.mock("@/lib/services/delivery-incidents-service", () => ({
  deliveryIncidentsService: {
    listDeliveryOrderIncidents: (...args: unknown[]) => listDeliveryOrderIncidentsMock(...args),
    createIncident: (...args: unknown[]) => createIncidentMock(...args),
  },
}))

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => useAuthMock(),
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
    total: 42,
    deliveryFee: 5,
    status: "CONFIRMED",
    createdAt: "2026-03-24T10:00:00.000Z",
    updatedAt: "2026-03-24T11:00:00.000Z",
    items: [],
    deliveryOrder: {
      id: "delivery-1",
      runnerId: "runner-1",
      status: "ASSIGNED",
      paymentStatus: "PAYMENT_PENDING",
    },
    providerOrders: [
      {
        id: "provider-order-1",
        providerId: "provider-1",
        providerName: "Cerámica Norte",
        status: "READY_FOR_PICKUP",
        paymentStatus: "PAID",
        subtotal: 18,
        originalSubtotal: 18,
        discountAmount: 0,
        items: [
          {
            id: "item-1",
            productId: "prod-1",
            quantity: 1,
            unitPrice: 18,
            baseUnitPrice: 18,
            appliedDiscountUnitPrice: null,
            discountAmount: 0,
            priceAtPurchase: 18,
            product: {
              id: "prod-1",
              name: "Cuenco artesanal",
              description: "desc",
              price: 18,
              stock: 3,
              city: "Sevilla",
              category: "Cerámica",
              providerId: "provider-1",
              createdAt: "2026-03-20T10:00:00.000Z",
            },
          },
        ],
      },
    ],
    ...overrides,
  }
}

describe("Provider support page", () => {
  beforeEach(() => {
    getAllMock.mockReset()
    getProviderOrderRefundsMock.mockReset()
    listDeliveryOrderIncidentsMock.mockReset()
    createIncidentMock.mockReset()
    toastMock.mockReset()
    useAuthMock.mockReset()
    useAuthMock.mockReturnValue({
      user: {
        userId: "provider-1",
        roles: ["PROVIDER"],
      },
    })
  })

  it("lists provider orders with visible incidents and refunds", async () => {
    getAllMock.mockResolvedValue([makeOrder()])
    getProviderOrderRefundsMock.mockResolvedValue([
      {
        id: "refund-1",
        providerOrderId: "provider-order-1",
        deliveryOrderId: null,
        incidentId: "incident-1",
        type: "PROVIDER_PARTIAL",
        status: "UNDER_REVIEW",
        amount: 3,
        currency: "EUR",
        requestedById: "client-1",
        reviewedById: null,
        externalRefundId: null,
        createdAt: "2026-03-26T10:00:00.000Z",
        reviewedAt: null,
        completedAt: null,
      },
    ])
    listDeliveryOrderIncidentsMock.mockResolvedValue([
      {
        id: "incident-1",
        deliveryOrderId: "delivery-1",
        reporterRole: "CLIENT",
        type: "DAMAGED_ITEMS",
        status: "OPEN",
        description: "Caja dañada",
        evidenceUrl: null,
        createdAt: "2026-03-26T11:00:00.000Z",
        resolvedAt: null,
      },
    ])

    const Page = (await import("@/app/[locale]/provider/support/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("Centro de soporte del comercio")).toBeInTheDocument()
    })

    expect(screen.getByText("Provider orders con soporte")).toBeInTheDocument()
    expect(screen.getByText("Cuenco artesanal")).toBeInTheDocument()
    expect(screen.getByText("PROVIDER_PARTIAL · En revisión")).toBeInTheDocument()
    expect(screen.getByText("DAMAGED_ITEMS · Abierta")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Ver ficha operativa/i })).toHaveAttribute(
      "href",
      "/provider/sales/provider-order-1",
    )
    expect(getAllMock).toHaveBeenCalled()
    expect(getProviderOrderRefundsMock).toHaveBeenCalledWith("provider-order-1")
    expect(listDeliveryOrderIncidentsMock).toHaveBeenCalledWith("delivery-1")
  })

  it("shows an empty state when there are no visible cases for the provider", async () => {
    getAllMock.mockResolvedValue([makeOrder()])
    getProviderOrderRefundsMock.mockResolvedValue([])
    listDeliveryOrderIncidentsMock.mockResolvedValue([])

    const Page = (await import("@/app/[locale]/provider/support/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("Centro de soporte del comercio")).toBeInTheDocument()
    })

    expect(
      screen.getByText(/No hay incidencias ni devoluciones visibles para tu comercio ahora mismo/i),
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Abrir finanzas/i })).toHaveAttribute(
      "href",
      "/provider/finance",
    )
  })

  it("lets the provider open an incident from the support hub", async () => {
    getAllMock.mockResolvedValue([makeOrder()])
    getProviderOrderRefundsMock.mockResolvedValue([])
    listDeliveryOrderIncidentsMock.mockResolvedValue([])
    createIncidentMock.mockResolvedValue({
      id: "incident-new",
      deliveryOrderId: "delivery-1",
      reporterRole: "PROVIDER",
      type: "DAMAGED_ITEMS",
      status: "OPEN",
      description: "Caja golpeada en recogida",
      evidenceUrl: null,
      createdAt: "2026-03-27T12:00:00.000Z",
      resolvedAt: null,
    })

    const Page = (await import("@/app/[locale]/provider/support/page")).default
    render(<Page />)

    await screen.findByText("Abrir incidencia operativa")

    fireEvent.change(
      screen.getByPlaceholderText(/Describe el problema operativo detectado/i),
      { target: { value: "Caja golpeada en recogida" } },
    )
    fireEvent.change(screen.getByPlaceholderText("https://..."), {
      target: { value: " https://evidence.example.com/photo.jpg " },
    })
    fireEvent.click(screen.getByRole("button", { name: /Registrar incidencia/i }))

    await waitFor(() => {
      expect(createIncidentMock).toHaveBeenCalledWith({
        deliveryOrderId: "delivery-1",
        type: "DAMAGED_ITEMS",
        description: "Caja golpeada en recogida",
        evidenceUrl: "https://evidence.example.com/photo.jpg",
      })
    })
    expect(toastMock).toHaveBeenCalled()
  })

  it("keeps the incident action disabled until the provider writes enough context", async () => {
    getAllMock.mockResolvedValue([makeOrder()])
    getProviderOrderRefundsMock.mockResolvedValue([])
    listDeliveryOrderIncidentsMock.mockResolvedValue([])

    const Page = (await import("@/app/[locale]/provider/support/page")).default
    render(<Page />)

    const submitButton = await screen.findByRole("button", { name: /Registrar incidencia/i })
    expect(submitButton).toBeDisabled()

    fireEvent.change(
      screen.getByPlaceholderText(/Describe el problema operativo detectado/i),
      { target: { value: "abc" } },
    )
    expect(submitButton).toBeDisabled()

    fireEvent.change(
      screen.getByPlaceholderText(/Describe el problema operativo detectado/i),
      { target: { value: "Caja golpeada en preparación" } },
    )
    expect(submitButton).toBeEnabled()
  })

  it("degrades safely when the main support load fails", async () => {
    getAllMock.mockRejectedValue(new Error("provider support down"))

    const Page = (await import("@/app/[locale]/provider/support/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("Centro de soporte del comercio")).toBeInTheDocument()
    })

    expect(
      screen.getByText(/No hay provider orders con entrega asociada sobre los que abrir incidencias/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/No hay incidencias ni devoluciones visibles para tu comercio ahora mismo/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Estamos mostrando el estado seguro vacío mientras el servicio se recupera/i),
    ).toBeInTheDocument()
    expect(getProviderOrderRefundsMock).not.toHaveBeenCalled()
    expect(listDeliveryOrderIncidentsMock).not.toHaveBeenCalled()
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Error",
        variant: "destructive",
      }),
    )
  })

  it("keeps the incident draft visible and shows an error toast when provider incident creation fails", async () => {
    createIncidentMock.mockRejectedValueOnce(new Error("submit failed"))
    getAllMock.mockResolvedValue([makeOrder()])
    getProviderOrderRefundsMock.mockResolvedValue([])
    listDeliveryOrderIncidentsMock.mockResolvedValue([])

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const Page = (await import("@/app/[locale]/provider/support/page")).default
    render(<Page />)

    fireEvent.change(
      await screen.findByPlaceholderText(/Describe el problema operativo detectado/i),
      { target: { value: "Caja rota al cargarla" } },
    )
    fireEvent.click(screen.getByRole("button", { name: /Registrar incidencia/i }))

    await waitFor(() => {
      expect(createIncidentMock).toHaveBeenCalledTimes(1)
    })

    expect(screen.getByDisplayValue("Caja rota al cargarla")).toBeInTheDocument()
    expect(toastMock).toHaveBeenCalledWith({
      title: "Error",
      description: "No se pudo registrar la incidencia del comercio.",
      variant: "destructive",
    })
    errorSpy.mockRestore()
  })

  it("falls back to empty support collections when secondary services return non-array payloads", async () => {
    getAllMock.mockResolvedValueOnce([makeOrder()])
    getProviderOrderRefundsMock.mockResolvedValueOnce({ invalid: true })
    listDeliveryOrderIncidentsMock.mockResolvedValueOnce(null)

    const Page = (await import("@/app/[locale]/provider/support/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("Centro de soporte del comercio")).toBeInTheDocument()
    })

    expect(
      screen.getByText(/No hay incidencias ni devoluciones visibles para tu comercio ahora mismo/i),
    ).toBeInTheDocument()
    expect(toastMock).not.toHaveBeenCalled()
  })

  it("renders unknown support statuses as a safe fallback label", async () => {
    getAllMock.mockResolvedValue([
      makeOrder({
        deliveryOrder: {
          id: "delivery-1",
          runnerId: "runner-1",
          status: "ASSIGNED",
          paymentStatus: "PENDING",
        },
      }),
    ])
    getProviderOrderRefundsMock.mockResolvedValue([
      {
        id: "refund-unknown",
        providerOrderId: "provider-order-1",
        deliveryOrderId: null,
        incidentId: null,
        type: "PROVIDER_PARTIAL",
        status: "UNKNOWN_STATUS",
        amount: 3,
        currency: "EUR",
        requestedById: "client-1",
        reviewedById: null,
        externalRefundId: null,
        createdAt: "2026-03-26T10:00:00.000Z",
        reviewedAt: null,
        completedAt: null,
      },
    ])
    listDeliveryOrderIncidentsMock.mockResolvedValue([
      {
        id: "incident-unknown",
        deliveryOrderId: "delivery-1",
        reporterRole: "CLIENT",
        type: "DAMAGED_ITEMS",
        status: "UNKNOWN_STATUS" as never,
        description: "Caja dañada",
        evidenceUrl: null,
        createdAt: "2026-03-26T11:00:00.000Z",
        resolvedAt: null,
      },
    ])

    const Page = (await import("@/app/[locale]/provider/support/page")).default
    render(<Page />)

    expect(await screen.findByText("Centro de soporte del comercio")).toBeInTheDocument()
    expect(screen.getAllByText(/Sin estado/i).length).toBeGreaterThan(0)
  })

  it("submits a provider incident without evidence and keeps the selected provider order after reload", async () => {
    const secondOrder = makeOrder({
      id: "order-2",
      providerOrders: [
        {
          id: "provider-order-2",
          providerId: "provider-1",
          providerName: "Textil Sur",
          status: "READY_FOR_PICKUP",
          paymentStatus: "PAID",
          subtotal: 14,
          originalSubtotal: 14,
          discountAmount: 0,
          items: [],
        },
      ],
      deliveryOrder: {
        id: "delivery-2",
        runnerId: "runner-2",
        status: "ASSIGNED",
        paymentStatus: "PAYMENT_PENDING",
      },
    })

    getAllMock.mockResolvedValue([makeOrder(), secondOrder])
    getProviderOrderRefundsMock.mockResolvedValue([])
    listDeliveryOrderIncidentsMock.mockResolvedValue([])
    createIncidentMock.mockResolvedValue({
      id: "incident-new",
      deliveryOrderId: "delivery-2",
      reporterRole: "PROVIDER",
      type: "DAMAGED_ITEMS",
      status: "OPEN",
      description: "Caja sin precinto",
      evidenceUrl: null,
      createdAt: "2026-03-27T12:00:00.000Z",
      resolvedAt: null,
    })

    const Page = (await import("@/app/[locale]/provider/support/page")).default
    render(<Page />)

    const [providerOrderSelect] = await screen.findAllByRole("combobox")
    fireEvent.change(providerOrderSelect, { target: { value: "provider-order-2" } })
    fireEvent.change(screen.getByPlaceholderText(/Describe el problema operativo detectado/i), {
      target: { value: "Caja sin precinto" },
    })
    fireEvent.click(screen.getByRole("button", { name: /Registrar incidencia/i }))

    await waitFor(() => {
      expect(createIncidentMock).toHaveBeenCalledWith({
        deliveryOrderId: "delivery-2",
        type: "DAMAGED_ITEMS",
        description: "Caja sin precinto",
      })
    })

    expect(createIncidentMock.mock.calls[0]?.[0]).not.toHaveProperty("evidenceUrl")
    await waitFor(() => {
      expect((screen.getAllByRole("combobox")[0] as HTMLSelectElement).value).toBe(
        "provider-order-2",
      )
    })
  })

  it("covers remaining provider support labels, empty subcards and product fallbacks", async () => {
    getAllMock.mockResolvedValue([
      makeOrder({
        providerOrders: [
          {
            id: "provider-order-1",
            providerId: "provider-1",
            providerName: undefined as unknown as string,
            status: "READY_FOR_PICKUP",
            paymentStatus: "PAID",
            subtotal: 18,
            originalSubtotal: 18,
            discountAmount: 0,
            items: [
              {
                id: "item-1",
                productId: "prod-1",
                quantity: 1,
                unitPrice: 18,
                baseUnitPrice: 18,
                appliedDiscountUnitPrice: null,
                discountAmount: 0,
                product: {
                  id: "prod-1",
                  name: "Cuenco artesanal",
                  description: "desc",
                  price: 18,
                  stock: 3,
                  city: "Sevilla",
                  category: "Cerámica",
                  providerId: "provider-1",
                  createdAt: "2026-03-20T10:00:00.000Z",
                },
              },
            ],
          },
        ],
      }),
      makeOrder({
        id: "order-2",
        providerOrders: [
          {
            id: "provider-order-2",
            providerId: "provider-1",
            providerName: "Textil Sur",
            status: "READY_FOR_PICKUP",
            paymentStatus: "PAID",
            subtotal: 14,
            originalSubtotal: 14,
            discountAmount: 0,
            items: [
              {
                id: "item-2",
                productId: "prod-raw",
                quantity: 1,
                unitPrice: 14,
                baseUnitPrice: 14,
                appliedDiscountUnitPrice: null,
                discountAmount: 0,
              },
            ],
          },
        ],
        deliveryOrder: {
          id: "delivery-2",
          runnerId: "runner-2",
          status: "ASSIGNED",
          paymentStatus: "PAYMENT_PENDING",
        },
      }),
    ])
    getProviderOrderRefundsMock.mockImplementation(async (providerOrderId: string) => {
      if (providerOrderId === "provider-order-1") {
        return [
          { id: "refund-1", providerOrderId, deliveryOrderId: null, incidentId: null, type: "PROVIDER_PARTIAL", status: "REQUESTED", amount: 1, currency: "EUR", requestedById: "client-1", reviewedById: null, externalRefundId: null, createdAt: "2026-03-26T10:00:00.000Z", reviewedAt: null, completedAt: null },
          { id: "refund-2", providerOrderId, deliveryOrderId: null, incidentId: null, type: "PROVIDER_PARTIAL", status: "APPROVED", amount: 2, currency: "EUR", requestedById: "client-1", reviewedById: null, externalRefundId: null, createdAt: "2026-03-26T10:00:00.000Z", reviewedAt: null, completedAt: null },
          { id: "refund-3", providerOrderId, deliveryOrderId: null, incidentId: null, type: "PROVIDER_PARTIAL", status: "REJECTED", amount: 3, currency: "EUR", requestedById: "client-1", reviewedById: null, externalRefundId: null, createdAt: "2026-03-26T10:00:00.000Z", reviewedAt: null, completedAt: null },
          { id: "refund-4", providerOrderId, deliveryOrderId: null, incidentId: null, type: "PROVIDER_PARTIAL", status: "EXECUTING", amount: 4, currency: "EUR", requestedById: "client-1", reviewedById: null, externalRefundId: null, createdAt: "2026-03-26T10:00:00.000Z", reviewedAt: null, completedAt: null },
          { id: "refund-5", providerOrderId, deliveryOrderId: null, incidentId: null, type: "PROVIDER_PARTIAL", status: "COMPLETED", amount: 5, currency: "EUR", requestedById: "client-1", reviewedById: null, externalRefundId: null, createdAt: "2026-03-26T10:00:00.000Z", reviewedAt: null, completedAt: null },
          { id: "refund-6", providerOrderId, deliveryOrderId: null, incidentId: null, type: "PROVIDER_PARTIAL", status: "FAILED", amount: 6, currency: "EUR", requestedById: "client-1", reviewedById: null, externalRefundId: null, createdAt: "2026-03-26T10:00:00.000Z", reviewedAt: null, completedAt: null },
        ]
      }
      return []
    })
    listDeliveryOrderIncidentsMock.mockImplementation(async (deliveryOrderId: string) => {
      if (deliveryOrderId === "delivery-2") {
        return [
          { id: "incident-1", deliveryOrderId, reporterRole: "CLIENT", type: "DAMAGED_ITEMS", status: "UNDER_REVIEW", description: "Caso 1", evidenceUrl: null, createdAt: "2026-03-26T11:00:00.000Z", resolvedAt: null },
          { id: "incident-2", deliveryOrderId, reporterRole: "CLIENT", type: "DAMAGED_ITEMS", status: "RESOLVED", description: "Caso 2", evidenceUrl: null, createdAt: "2026-03-26T11:00:00.000Z", resolvedAt: null },
          { id: "incident-3", deliveryOrderId, reporterRole: "CLIENT", type: "DAMAGED_ITEMS", status: "REJECTED", description: "Caso 3", evidenceUrl: null, createdAt: "2026-03-26T11:00:00.000Z", resolvedAt: null },
        ]
      }
      return []
    })

    const Page = (await import("@/app/[locale]/provider/support/page")).default
    render(<Page />)

    expect(await screen.findByText("Centro de soporte del comercio")).toBeInTheDocument()
    expect(screen.getByRole("option", { name: /Comercio · Pedido #ORDER-1/i })).toBeInTheDocument()
    expect(screen.getByText("provider-order-2")).toBeInTheDocument()
    expect(screen.getAllByText("PROVIDER_PARTIAL · Solicitada").length).toBeGreaterThan(0)
    expect(screen.getAllByText("PROVIDER_PARTIAL · Aprobada").length).toBeGreaterThan(0)
    expect(screen.getAllByText("PROVIDER_PARTIAL · Rechazada").length).toBeGreaterThan(0)
    expect(screen.getAllByText("PROVIDER_PARTIAL · Ejecutando").length).toBeGreaterThan(0)
    expect(screen.getAllByText("PROVIDER_PARTIAL · Completada").length).toBeGreaterThan(0)
    expect(screen.getAllByText("PROVIDER_PARTIAL · Fallida").length).toBeGreaterThan(0)
    expect(screen.getAllByText("DAMAGED_ITEMS · En revisión").length).toBeGreaterThan(0)
    expect(screen.getAllByText("DAMAGED_ITEMS · Resuelta").length).toBeGreaterThan(0)
    expect(screen.getAllByText("DAMAGED_ITEMS · Rechazada").length).toBeGreaterThan(0)
    expect(screen.getByText("Sin incidencias visibles.")).toBeInTheDocument()
    expect(screen.getByText("Sin devoluciones visibles.")).toBeInTheDocument()
  })
})
