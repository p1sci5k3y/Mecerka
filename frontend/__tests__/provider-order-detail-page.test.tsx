import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import type { Order } from "@/lib/types"

const mockUseParams = vi.fn()
const getAllMock = vi.fn()
const getProviderOrderRefundsMock = vi.fn()
const listDeliveryOrderIncidentsMock = vi.fn()
const useAuthMock = vi.fn()

vi.mock("next/navigation", () => ({
  useParams: () => mockUseParams(),
}))

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
    id: "root-order-1",
    userId: "client-1",
    total: 48,
    deliveryFee: 6,
    status: "IN_TRANSIT",
    createdAt: "2026-03-27T10:00:00.000Z",
    updatedAt: "2026-03-27T11:00:00.000Z",
    deliveryAddress: "Calle Feria 12",
    items: [],
    providerOrders: [
      {
        id: "provider-order-1",
        providerId: "provider-1",
        providerName: "Cerámica Norte",
        status: "READY_FOR_PICKUP",
        paymentStatus: "PAID",
        subtotal: 24,
        originalSubtotal: 24,
        discountAmount: 0,
        items: [
          {
            id: "item-1",
            productId: "prod-1",
            quantity: 2,
            unitPrice: 12,
            baseUnitPrice: 12,
            appliedDiscountUnitPrice: null,
            discountAmount: 0,
            product: {
              id: "prod-1",
              name: "Cuenco artesanal",
              description: "desc",
              price: 12,
              stock: 5,
              city: "Sevilla",
              category: "Cerámica",
              providerId: "provider-1",
              createdAt: "2026-03-20T10:00:00.000Z",
            },
          },
        ],
      },
    ],
    deliveryOrder: {
      id: "delivery-1",
      runnerId: "runner-1",
      status: "IN_TRANSIT",
      paymentStatus: "PAYMENT_PENDING",
    },
    ...overrides,
  }
}

describe("ProviderOrderDetailPage", () => {
  beforeEach(() => {
    mockUseParams.mockReset()
    getAllMock.mockReset()
    getProviderOrderRefundsMock.mockReset()
    listDeliveryOrderIncidentsMock.mockReset()
    useAuthMock.mockReset()
    mockUseParams.mockReturnValue({ providerOrderId: "provider-order-1" })
    useAuthMock.mockReturnValue({
      user: {
        userId: "provider-1",
        roles: ["PROVIDER"],
      },
    })
  })

  it("renders the provider order detail hub with finance and operations links", async () => {
    getAllMock.mockResolvedValueOnce([makeOrder()])
    getProviderOrderRefundsMock.mockResolvedValueOnce([
      {
        id: "refund-1",
        incidentId: null,
        providerOrderId: "provider-order-1",
        deliveryOrderId: null,
        type: "PROVIDER_PARTIAL",
        status: "UNDER_REVIEW",
        amount: 6,
        currency: "EUR",
        requestedById: "client-1",
        reviewedById: null,
        externalRefundId: null,
        createdAt: "2026-03-27T12:00:00.000Z",
        reviewedAt: null,
        completedAt: null,
      },
    ])
    listDeliveryOrderIncidentsMock.mockResolvedValueOnce([
      {
        id: "incident-1",
        deliveryOrderId: "delivery-1",
        reporterRole: "CLIENT",
        type: "DAMAGED_ITEMS",
        status: "UNDER_REVIEW",
        description: "La caja llegó dañada",
        evidenceUrl: null,
        createdAt: "2026-03-27T12:30:00.000Z",
        resolvedAt: null,
      },
    ])

    const Page = (await import("@/app/[locale]/provider/sales/[providerOrderId]/page")).default
    render(<Page />)

    expect(await screen.findByText("Ficha operativa del provider order")).toBeInTheDocument()
    expect(getAllMock).toHaveBeenCalledTimes(1)
    expect(getProviderOrderRefundsMock).toHaveBeenCalledWith("provider-order-1")
    expect(listDeliveryOrderIncidentsMock).toHaveBeenCalledWith("delivery-1")
    expect(screen.getByText("Cuenco artesanal")).toBeInTheDocument()
    expect(screen.getAllByText("En revisión")).toHaveLength(2)
    expect(screen.getByText("La caja llegó dañada")).toBeInTheDocument()
    expect(screen.getByText("Incidencias visibles")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Abrir cobros y devoluciones/i })).toHaveAttribute(
      "href",
      "/provider/finance",
    )
    expect(screen.getByRole("link", { name: /Abrir soporte/i })).toHaveAttribute(
      "href",
      "/provider/support",
    )
    expect(screen.getAllByRole("link", { name: /Volver al panel operativo|Volver al kanban/i })).toHaveLength(2)
  })

  it("shows a safe error state when the provider order is missing from the provider scope", async () => {
    getAllMock.mockResolvedValueOnce([
      makeOrder({
        providerOrders: [
          {
            id: "provider-order-1",
            providerId: "provider-2",
            providerName: "Otro comercio",
            status: "PENDING",
            paymentStatus: "PAYMENT_PENDING",
            subtotal: 24,
            originalSubtotal: 24,
            discountAmount: 0,
            items: [],
          },
        ],
      }),
    ])

    const Page = (await import("@/app/[locale]/provider/sales/[providerOrderId]/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(
        screen.getByText("No encontramos este provider order en tu panel."),
      ).toBeInTheDocument()
    })
  })

  it("keeps the provider hub operational when refunds or incidents cannot be loaded", async () => {
    getAllMock.mockResolvedValueOnce([makeOrder()])
    getProviderOrderRefundsMock.mockRejectedValueOnce(new Error("offline"))
    listDeliveryOrderIncidentsMock.mockRejectedValueOnce(new Error("offline"))

    const Page = (await import("@/app/[locale]/provider/sales/[providerOrderId]/page")).default
    render(<Page />)

    expect(await screen.findByText("Ficha operativa del provider order")).toBeInTheDocument()
    expect(screen.getAllByText("0")).toHaveLength(2)
    expect(screen.getAllByText("Cobrado").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Listo para recogida").length).toBeGreaterThan(0)
  })

  it("shows fallback labels when support, delivery and product context are missing", async () => {
    getAllMock.mockResolvedValueOnce([
      makeOrder({
        status: "PENDING",
        deliveryAddress: "",
        providerOrders: [
          {
            id: "provider-order-1",
            providerId: "provider-1",
            providerName: "",
            status: "PENDING",
            paymentStatus: undefined,
            subtotal: 24,
            originalSubtotal: 24,
            discountAmount: 0,
            items: [
              {
                id: "item-1",
                productId: "prod-raw",
                quantity: 2,
                unitPrice: 12,
                baseUnitPrice: 12,
                appliedDiscountUnitPrice: null,
                discountAmount: 0,
              },
            ],
          },
        ],
        deliveryOrder: undefined,
      }),
    ])
    getProviderOrderRefundsMock.mockResolvedValueOnce([])

    const Page = (await import("@/app/[locale]/provider/sales/[providerOrderId]/page")).default
    render(<Page />)

    expect(await screen.findByText("Ficha operativa del provider order")).toBeInTheDocument()
    expect(screen.getByText("Producto prod-raw")).toBeInTheDocument()
    expect(screen.getAllByText("Sin estado").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Pendiente").length).toBeGreaterThan(0)
    expect(screen.getByText("No hay devoluciones visibles todavía para este tramo.")).toBeInTheDocument()
    expect(screen.getByText("No hay incidencias visibles para esta entrega.")).toBeInTheDocument()
    expect(screen.getByText("Sin reparto asignado")).toBeInTheDocument()
  })

  it("falls back to empty collections and human labels when support payloads or statuses are unknown", async () => {
    getAllMock.mockResolvedValue([
      makeOrder({
        status: "UNKNOWN_ROOT" as never,
        providerOrders: [
          {
            id: "provider-order-1",
            providerId: "provider-1",
            providerName: "Cerámica Norte",
            status: "UNKNOWN_PROVIDER" as never,
            paymentStatus: undefined,
            subtotal: 24,
            originalSubtotal: 24,
            discountAmount: 0,
            items: [
              {
                id: "item-1",
                productId: "prod-1",
                quantity: 2,
                unitPrice: 12,
                baseUnitPrice: 12,
                appliedDiscountUnitPrice: null,
                discountAmount: 0,
                product: {
                  id: "prod-1",
                  name: "Cuenco artesanal",
                  description: "desc",
                  price: 12,
                  stock: 5,
                  city: "Sevilla",
                  category: "Cerámica",
                  providerId: "provider-1",
                  createdAt: "2026-03-20T10:00:00.000Z",
                },
              },
            ],
          },
        ],
        deliveryOrder: {
          id: "delivery-1",
          runnerId: "runner-1",
          status: "UNKNOWN_DELIVERY" as never,
          paymentStatus: "UNKNOWN_PAYMENT" as never,
        },
      }),
    ])
    getProviderOrderRefundsMock.mockResolvedValue({ invalid: true })
    listDeliveryOrderIncidentsMock.mockResolvedValue(null)

    const Page = (await import("@/app/[locale]/provider/sales/[providerOrderId]/page")).default
    render(<Page />)

    expect(await screen.findByText("Ficha operativa del provider order")).toBeInTheDocument()
    expect(screen.getAllByText("Sin estado").length).toBeGreaterThan(0)
    expect(screen.getByText("No hay devoluciones visibles todavía para este tramo.")).toBeInTheDocument()
    expect(screen.getByText("No hay incidencias visibles para esta entrega.")).toBeInTheDocument()
  })

  it("renders unknown incident and refund statuses as safe fallback labels", async () => {
    getAllMock.mockResolvedValue([
      makeOrder({
        providerOrders: [
          {
            id: "provider-order-1",
            providerId: "provider-1",
            providerName: "Cerámica Norte",
            status: "READY_FOR_PICKUP",
            paymentStatus: "PAID",
            subtotal: 24,
            originalSubtotal: 24,
            discountAmount: 0,
            items: [
              {
                id: "item-1",
                productId: "prod-1",
                quantity: 2,
                unitPrice: 12,
                baseUnitPrice: 12,
                appliedDiscountUnitPrice: null,
                discountAmount: 0,
                product: {
                  id: "prod-1",
                  name: "Cuenco artesanal",
                  description: "desc",
                  price: 12,
                  stock: 5,
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
    ])
    getProviderOrderRefundsMock.mockResolvedValue([
      {
        id: "refund-unknown",
        incidentId: null,
        providerOrderId: "provider-order-1",
        deliveryOrderId: null,
        type: "PROVIDER_PARTIAL",
        status: "UNKNOWN_STATUS",
        amount: 6,
        currency: "EUR",
        requestedById: "client-1",
        reviewedById: null,
        externalRefundId: null,
        createdAt: "2026-03-27T12:00:00.000Z",
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
        description: "La caja llegó dañada",
        evidenceUrl: null,
        createdAt: "2026-03-27T12:30:00.000Z",
        resolvedAt: null,
      },
    ])

    const Page = (await import("@/app/[locale]/provider/sales/[providerOrderId]/page")).default
    render(<Page />)

    expect(await screen.findByText("Ficha operativa del provider order")).toBeInTheDocument()
    expect(screen.getAllByText(/Sin estado/i).length).toBeGreaterThan(0)
  })

  it("renders delivered, completed and resolved labels across the provider hub", async () => {
    getAllMock.mockResolvedValueOnce([
      makeOrder({
        status: "DELIVERED",
        providerOrders: [
          {
            id: "provider-order-1",
            providerId: "provider-1",
            providerName: "Cerámica Norte",
            status: "DELIVERED",
            paymentStatus: "FAILED",
            subtotal: 24,
            originalSubtotal: 24,
            discountAmount: 0,
            items: [
              {
                id: "item-1",
                productId: "prod-1",
                quantity: 2,
                unitPrice: 12,
                baseUnitPrice: 12,
                appliedDiscountUnitPrice: null,
                discountAmount: 0,
                product: {
                  id: "prod-1",
                  name: "Cuenco artesanal",
                  description: "desc",
                  price: 12,
                  stock: 5,
                  city: "Sevilla",
                  category: "Cerámica",
                  providerId: "provider-1",
                  createdAt: "2026-03-20T10:00:00.000Z",
                },
              },
            ],
          },
        ],
        deliveryOrder: {
          id: "delivery-1",
          runnerId: "runner-1",
          status: "DELIVERED",
          paymentStatus: "FAILED",
        },
      }),
    ])
    getProviderOrderRefundsMock.mockResolvedValueOnce([
      {
        id: "refund-2",
        incidentId: null,
        providerOrderId: "provider-order-1",
        deliveryOrderId: null,
        type: "PROVIDER_FULL",
        status: "COMPLETED",
        amount: 24,
        currency: "EUR",
        requestedById: "client-1",
        reviewedById: "admin-1",
        externalRefundId: "re_123",
        createdAt: "2026-03-27T12:00:00.000Z",
        reviewedAt: "2026-03-27T12:10:00.000Z",
        completedAt: "2026-03-27T12:20:00.000Z",
      },
    ])
    listDeliveryOrderIncidentsMock.mockResolvedValueOnce([
      {
        id: "incident-2",
        deliveryOrderId: "delivery-1",
        reporterRole: "CLIENT",
        type: "FAILED_DELIVERY",
        status: "RESOLVED",
        description: "Incidencia ya cerrada",
        evidenceUrl: null,
        createdAt: "2026-03-27T12:30:00.000Z",
        resolvedAt: "2026-03-27T13:00:00.000Z",
      },
    ])

    const Page = (await import("@/app/[locale]/provider/sales/[providerOrderId]/page")).default
    render(<Page />)

    expect(await screen.findByText("Ficha operativa del provider order")).toBeInTheDocument()
    expect(screen.getAllByText("Entregado").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Pago fallido").length).toBeGreaterThan(0)
    expect(screen.getByText("Completada")).toBeInTheDocument()
    expect(screen.getByText("Resuelta")).toBeInTheDocument()
  })

  it("stops early when the route param or provider identity is missing", async () => {
    mockUseParams.mockReturnValueOnce({ providerOrderId: undefined })
    useAuthMock.mockReturnValue({ user: null })

    const Page = (await import("@/app/[locale]/provider/sales/[providerOrderId]/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(getAllMock).not.toHaveBeenCalled()
    })

    expect(screen.queryByText("No pudimos cargar esta ficha operativa.")).not.toBeInTheDocument()
  })

  it("renders accepted assignment states across finance, order and delivery labels", async () => {
    getAllMock.mockResolvedValueOnce([
      makeOrder({
        status: "CONFIRMED",
        providerOrders: [
          {
            id: "provider-order-1",
            providerId: "provider-1",
            providerName: "Cerámica Norte",
            status: "ACCEPTED",
            paymentStatus: "PAYMENT_READY",
            subtotal: 24,
            originalSubtotal: 24,
            discountAmount: 0,
            items: [{ id: "item-1", productId: "prod-1", quantity: 2, unitPrice: 12, baseUnitPrice: 12, appliedDiscountUnitPrice: null, discountAmount: 0 }],
          },
        ],
        deliveryOrder: {
          id: "delivery-1",
          runnerId: "runner-1",
          status: "ASSIGNED",
          paymentStatus: "PAYMENT_PENDING",
        },
      }),
    ])
    getProviderOrderRefundsMock.mockResolvedValueOnce([
      {
        id: "refund-1",
        incidentId: null,
        providerOrderId: "provider-order-1",
        deliveryOrderId: null,
        type: "PROVIDER_PARTIAL",
        status: "REQUESTED",
        amount: 6,
        currency: "EUR",
        requestedById: "client-1",
        reviewedById: null,
        externalRefundId: null,
        createdAt: "2026-03-27T12:00:00.000Z",
        reviewedAt: null,
        completedAt: null,
      },
    ])
    listDeliveryOrderIncidentsMock.mockResolvedValueOnce([
      {
        id: "incident-1",
        deliveryOrderId: "delivery-1",
        reporterRole: "CLIENT",
        type: "DAMAGED_ITEMS",
        status: "OPEN",
        description: "Caso abierto",
        evidenceUrl: null,
        createdAt: "2026-03-27T12:30:00.000Z",
        resolvedAt: null,
      },
    ])

    const Page = (await import("@/app/[locale]/provider/sales/[providerOrderId]/page")).default
    render(<Page />)

    expect(await screen.findByText("Ficha operativa del provider order")).toBeInTheDocument()
    expect(screen.getAllByText("Aceptado").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Sesión lista").length).toBeGreaterThan(0)
    expect(screen.getByText("Confirmado")).toBeInTheDocument()
    expect(screen.getByText("Asignado")).toBeInTheDocument()
    expect(screen.getByText("Solicitada")).toBeInTheDocument()
    expect(screen.getByText("Abierta")).toBeInTheDocument()
  })

  it("renders preparing and queued states with approved and rejected support labels", async () => {
    getAllMock.mockResolvedValueOnce([
      makeOrder({
        status: "READY_FOR_ASSIGNMENT",
        providerOrders: [
          {
            id: "provider-order-1",
            providerId: "provider-1",
            providerName: "Cerámica Norte",
            status: "PREPARING",
            paymentStatus: "PAYMENT_READY",
            subtotal: 24,
            originalSubtotal: 24,
            discountAmount: 0,
            items: [{ id: "item-1", productId: "prod-1", quantity: 2, unitPrice: 12, baseUnitPrice: 12, appliedDiscountUnitPrice: null, discountAmount: 0 }],
          },
        ],
        deliveryOrder: {
          id: "delivery-1",
          runnerId: "runner-1",
          status: "CANCELLED",
          paymentStatus: "FAILED",
        },
      }),
    ])
    getProviderOrderRefundsMock.mockResolvedValueOnce([
      {
        id: "refund-2",
        incidentId: null,
        providerOrderId: "provider-order-1",
        deliveryOrderId: null,
        type: "PROVIDER_FULL",
        status: "APPROVED",
        amount: 24,
        currency: "EUR",
        requestedById: "client-1",
        reviewedById: null,
        externalRefundId: null,
        createdAt: "2026-03-27T12:00:00.000Z",
        reviewedAt: null,
        completedAt: null,
      },
      {
        id: "refund-3",
        incidentId: null,
        providerOrderId: "provider-order-1",
        deliveryOrderId: null,
        type: "PROVIDER_PARTIAL",
        status: "REJECTED",
        amount: 3,
        currency: "EUR",
        requestedById: "client-1",
        reviewedById: null,
        externalRefundId: null,
        createdAt: "2026-03-27T12:00:00.000Z",
        reviewedAt: null,
        completedAt: null,
      },
      {
        id: "refund-4",
        incidentId: null,
        providerOrderId: "provider-order-1",
        deliveryOrderId: null,
        type: "PROVIDER_PARTIAL",
        status: "EXECUTING",
        amount: 3,
        currency: "EUR",
        requestedById: "client-1",
        reviewedById: null,
        externalRefundId: null,
        createdAt: "2026-03-27T12:00:00.000Z",
        reviewedAt: null,
        completedAt: null,
      },
    ])
    listDeliveryOrderIncidentsMock.mockResolvedValueOnce([
      {
        id: "incident-2",
        deliveryOrderId: "delivery-1",
        reporterRole: "CLIENT",
        type: "FAILED_DELIVERY",
        status: "REJECTED",
        description: "Caso rechazado",
        evidenceUrl: null,
        createdAt: "2026-03-27T12:30:00.000Z",
        resolvedAt: null,
      },
    ])

    const Page = (await import("@/app/[locale]/provider/sales/[providerOrderId]/page")).default
    render(<Page />)

    expect(await screen.findByText("Ficha operativa del provider order")).toBeInTheDocument()
    expect(screen.getAllByText("Preparando").length).toBeGreaterThan(0)
    expect(screen.getByText("Listo para asignación")).toBeInTheDocument()
    expect(screen.getAllByText("Cancelado").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Aprobada").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Rechazada").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Ejecutando").length).toBeGreaterThan(0)
  })

  it("renders assigned root status and rejected store states", async () => {
    getAllMock.mockResolvedValueOnce([
      makeOrder({
        status: "ASSIGNED",
        providerOrders: [
          {
            id: "provider-order-1",
            providerId: "provider-1",
            providerName: "Cerámica Norte",
            status: "REJECTED_BY_STORE",
            paymentStatus: "FAILED",
            subtotal: 24,
            originalSubtotal: 24,
            discountAmount: 0,
            items: [{ id: "item-1", productId: "prod-1", quantity: 2, unitPrice: 12, baseUnitPrice: 12, appliedDiscountUnitPrice: null, discountAmount: 0 }],
          },
        ],
        deliveryOrder: {
          id: "delivery-1",
          runnerId: "runner-1",
          status: "ASSIGNED",
          paymentStatus: "FAILED",
        },
      }),
    ])
    getProviderOrderRefundsMock.mockResolvedValueOnce([])
    listDeliveryOrderIncidentsMock.mockResolvedValueOnce([])

    const Page = (await import("@/app/[locale]/provider/sales/[providerOrderId]/page")).default
    render(<Page />)

    expect(await screen.findByText("Ficha operativa del provider order")).toBeInTheDocument()
    expect(screen.getByText("Repartidor asignado")).toBeInTheDocument()
    expect(screen.getAllByText("Rechazado por comercio").length).toBeGreaterThan(0)
  })
})
