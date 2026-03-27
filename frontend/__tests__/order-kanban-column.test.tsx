import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import type { Order, ProviderOrder } from "@/lib/types"
import { OrderKanbanColumn } from "@/components/provider/OrderKanbanColumn"

vi.mock("@/components/provider/ProviderOrderCard", () => ({
  ProviderOrderCard: ({
    order,
    providerOrderId,
  }: {
    order: Order
    providerOrderId: string
  }) => <div data-testid="provider-order-card">{order.id}:{providerOrderId}</div>,
}))

function makeOrder(id: string, providerId: string, status: string): Order {
  return {
    id,
    userId: "client-1",
    total: 20,
    deliveryFee: 3,
    status: "CONFIRMED",
    createdAt: "2026-03-27T10:00:00.000Z",
    items: [],
    providerOrders: [
      {
        id: `${id}-${providerId}`,
        providerId,
        status: status as ProviderOrder["status"],
        paymentStatus: "UNPAID",
        subtotal: 20,
        originalSubtotal: 20,
        discountAmount: 0,
        items: [],
      },
    ],
  }
}

describe("OrderKanbanColumn", () => {
  it("shows an empty state when no provider orders match the column", () => {
    render(
      <OrderKanbanColumn
        title="Nuevos"
        icon={<span>N</span>}
        orders={[makeOrder("order-1", "provider-2", "PENDING")]}
        providerId="provider-1"
        validStatuses={["PENDING"]}
        now={new Date("2026-03-27T12:00:00.000Z")}
        onStatusChange={vi.fn()}
        onReject={vi.fn()}
      />,
    )

    expect(screen.getByText("No hay pedidos")).toBeInTheDocument()
    expect(screen.getByText("0")).toBeInTheDocument()
  })

  it("renders only orders for the current provider and valid statuses", () => {
    render(
      <OrderKanbanColumn
        title="Nuevos"
        icon={<span>N</span>}
        orders={[
          makeOrder("order-1", "provider-1", "PENDING"),
          makeOrder("order-2", "provider-1", "PREPARING"),
          makeOrder("order-3", "provider-2", "PENDING"),
        ]}
        providerId="provider-1"
        validStatuses={["PENDING"]}
        now={new Date("2026-03-27T12:00:00.000Z")}
        onStatusChange={vi.fn()}
        onReject={vi.fn()}
      />,
    )

    expect(screen.getByText("1")).toBeInTheDocument()
    expect(screen.getByTestId("provider-order-card")).toHaveTextContent(
      "order-1:order-1-provider-1",
    )
    expect(screen.queryByText(/order-2/)).not.toBeInTheDocument()
    expect(screen.queryByText(/order-3/)).not.toBeInTheDocument()
  })
})
