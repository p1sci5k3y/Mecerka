import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { Order, ProviderOrder } from "@/lib/types"

const onStatusChangeMock = vi.fn()
const onRejectMock = vi.fn()

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    asChild,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) =>
    asChild ? <>{children}</> : <button {...rest}>{children}</button>,
}))

vi.mock("@/components/ui/badge", () => ({
  Badge: ({
    children,
    ...rest
  }: React.HTMLAttributes<HTMLDivElement>) => <div {...rest}>{children}</div>,
}))

vi.mock("@/lib/navigation", () => ({
  Link: ({ href, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

function makeProviderOrder(
  overrides: Partial<ProviderOrder>,
): ProviderOrder {
  return {
    id: "po-1",
    providerId: "provider-1",
    providerName: "Taller Sevilla",
    status: "PENDING",
    paymentStatus: "UNPAID",
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
          createdAt: "2026-03-24T10:00:00.000Z",
        },
      },
    ],
    createdAt: "2026-03-24T10:00:00.000Z",
    updatedAt: "2026-03-24T10:05:00.000Z",
    ...overrides,
  }
}

function makeOrder(providerOrder: ProviderOrder, extraProviderOrders = 0): Order {
  return {
    id: "order-1",
    userId: "client-1",
    total: 24,
    deliveryFee: 4,
    status: "CONFIRMED",
    createdAt: "2026-03-24T10:00:00.000Z",
    items: [],
    providerOrders: [
      providerOrder,
      ...Array.from({ length: extraProviderOrders }, (_, index) =>
        makeProviderOrder({
          id: `other-${index + 1}`,
          providerId: `provider-${index + 2}`,
          providerName: `Tienda ${index + 2}`,
        }),
      ),
    ],
  }
}

describe("ProviderOrderCard operational experience", () => {
  beforeEach(() => {
    onStatusChangeMock.mockReset()
    onRejectMock.mockReset()
  })

  it("lets the provider accept a pending order", async () => {
    const providerOrder = makeProviderOrder({ status: "PENDING" })
    const order = makeOrder(providerOrder, 1)

    const { ProviderOrderCard } = await import("@/components/provider/ProviderOrderCard")
    render(
      <ProviderOrderCard
        order={order}
        providerOrderId={providerOrder.id}
        now={new Date("2026-03-24T10:20:00.000Z")}
        onStatusChange={onStatusChangeMock}
        onReject={onRejectMock}
      />,
    )

    expect(screen.getByText("Compartido")).toBeInTheDocument()
    expect(screen.getByText("15 min")).toBeInTheDocument()
    expect(screen.getByText("24.00 €")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Ver detalle/i })).toHaveAttribute(
      "href",
      "/provider/sales/po-1",
    )

    fireEvent.click(screen.getByRole("button", { name: "Aceptar Pedido" }))
    await waitFor(() => {
      expect(onStatusChangeMock).toHaveBeenCalledWith(
        providerOrder.id,
        "PENDING",
        "ACCEPTED",
      )
    })
  })

  it("lets the provider reject a pending order", async () => {
    const providerOrder = makeProviderOrder({ status: "PENDING" })
    const order = makeOrder(providerOrder, 1)

    const { ProviderOrderCard } = await import("@/components/provider/ProviderOrderCard")
    render(
      <ProviderOrderCard
        order={order}
        providerOrderId={providerOrder.id}
        now={new Date("2026-03-24T10:20:00.000Z")}
        onStatusChange={onStatusChangeMock}
        onReject={onRejectMock}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Rechazar" }))
    await waitFor(() => {
      expect(onRejectMock).toHaveBeenCalledWith(providerOrder.id)
    })
  })

  it("advances accepted and preparing orders through the visible workshop flow", async () => {
    const { ProviderOrderCard } = await import("@/components/provider/ProviderOrderCard")

    const acceptedOrder = makeProviderOrder({ id: "po-accepted", status: "ACCEPTED" })
    const preparingOrder = makeProviderOrder({ id: "po-preparing", status: "PREPARING" })

    const { rerender } = render(
      <ProviderOrderCard
        order={makeOrder(acceptedOrder)}
        providerOrderId={acceptedOrder.id}
        now={new Date("2026-03-24T10:20:00.000Z")}
        onStatusChange={onStatusChangeMock}
        onReject={onRejectMock}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Empezar a Preparar" }))
    await waitFor(() => {
      expect(onStatusChangeMock).toHaveBeenCalledWith(
        "po-accepted",
        "ACCEPTED",
        "PREPARING",
      )
    })

    onStatusChangeMock.mockReset()

    rerender(
      <ProviderOrderCard
        order={makeOrder(preparingOrder)}
        providerOrderId={preparingOrder.id}
        now={new Date("2026-03-24T10:20:00.000Z")}
        onStatusChange={onStatusChangeMock}
        onReject={onRejectMock}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Marcar Listo" }))
    await waitFor(() => {
      expect(onStatusChangeMock).toHaveBeenCalledWith(
        "po-preparing",
        "PREPARING",
        "READY_FOR_PICKUP",
      )
    })
  })

  it("shows passive ready-for-pickup state without extra action button", async () => {
    const providerOrder = makeProviderOrder({ status: "READY_FOR_PICKUP" })
    const order = makeOrder(providerOrder)

    const { ProviderOrderCard } = await import("@/components/provider/ProviderOrderCard")
    render(
      <ProviderOrderCard
        order={order}
        providerOrderId={providerOrder.id}
        now={new Date("2026-03-24T10:20:00.000Z")}
        onStatusChange={onStatusChangeMock}
        onReject={onRejectMock}
      />,
    )

    expect(screen.getByText("Individual")).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /Marcar Listo|Aceptar Pedido|Empezar a Preparar/i }),
    ).not.toBeInTheDocument()
  })

  it("renders fallback product/timer data and no action for unknown or cancelled statuses", async () => {
    const cancelledOrder = makeProviderOrder({
      id: "po-cancelled",
      status: "CANCELLED",
      items: [{ id: "item-1", productId: "prod-raw", quantity: 1, unitPrice: 12, baseUnitPrice: 12, appliedDiscountUnitPrice: null, discountAmount: 0 }],
      updatedAt: undefined,
      createdAt: undefined,
    })

    const { ProviderOrderCard } = await import("@/components/provider/ProviderOrderCard")
    const { rerender, container } = render(
      <ProviderOrderCard
        order={makeOrder(cancelledOrder)}
        providerOrderId={cancelledOrder.id}
        now={new Date("2026-03-24T10:20:00.000Z")}
        onStatusChange={onStatusChangeMock}
        onReject={onRejectMock}
      />,
    )

    expect(screen.getByText("Producto desconocido")).toBeInTheDocument()
    expect(screen.getByText("20 min")).toBeInTheDocument()
    expect(container.firstChild).toHaveClass("opacity-50")
    expect(
      screen.queryByRole("button", { name: /Aceptar Pedido|Empezar a Preparar|Marcar Listo|Rechazar/i }),
    ).not.toBeInTheDocument()

    const unknownOrder = makeProviderOrder({
      id: "po-unknown",
      status: "UNKNOWN_STATUS" as never,
    })

    rerender(
      <ProviderOrderCard
        order={makeOrder(unknownOrder)}
        providerOrderId={unknownOrder.id}
        now={new Date("2026-03-24T10:20:00.000Z")}
        onStatusChange={onStatusChangeMock}
        onReject={onRejectMock}
      />,
    )

    expect(screen.queryByRole("button", { name: /Aceptar Pedido|Empezar a Preparar|Marcar Listo|Rechazar/i })).not.toBeInTheDocument()
  })

  it("returns null when the provider order is missing from the order payload", async () => {
    const { ProviderOrderCard } = await import("@/components/provider/ProviderOrderCard")
    const { container } = render(
      <ProviderOrderCard
        order={makeOrder(makeProviderOrder({ id: "po-1" }))}
        providerOrderId="missing-provider-order"
        now={new Date("2026-03-24T10:20:00.000Z")}
        onStatusChange={onStatusChangeMock}
        onReject={onRejectMock}
      />,
    )

    expect(container.firstChild).toBeNull()
  })
})
