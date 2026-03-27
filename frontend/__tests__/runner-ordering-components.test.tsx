import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import type { Order } from "@/lib/types"
import { RunnerAvailableList } from "@/components/runner/RunnerAvailableList"
import { RunnerOrderCard } from "@/components/runner/RunnerOrderCard"

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "runner-order-1",
    userId: "client-1",
    total: 32,
    deliveryFee: 5.5,
    status: "CONFIRMED",
    createdAt: "2026-03-27T10:00:00.000Z",
    items: [],
    providerOrders: [
      {
        id: "provider-order-1",
        providerId: "provider-1",
        status: "READY_FOR_PICKUP",
        paymentStatus: "PAID",
        subtotal: 32,
        originalSubtotal: 32,
        discountAmount: 0,
        items: [],
      },
    ],
    ...overrides,
  }
}

describe("Runner ordering components", () => {
  it("shows the runner empty state when there are no available orders", () => {
    render(<RunnerAvailableList orders={[]} onAccept={vi.fn()} />)

    expect(screen.getByText("Todo al día")).toBeInTheDocument()
    expect(
      screen.getByText(/No hay pedidos disponibles en este momento/i),
    ).toBeInTheDocument()
  })

  it("renders available orders and accepts them from the list", () => {
    const onAccept = vi.fn()
    render(<RunnerAvailableList orders={[makeOrder()]} onAccept={onAccept} />)

    fireEvent.click(screen.getByRole("button", { name: /Aceptar Pedido/i }))

    expect(onAccept).toHaveBeenCalledWith("runner-order-1")
  })

  it("shows the multi-stop badge and disables acceptance when requested", () => {
    const onAccept = vi.fn()
    render(
      <RunnerOrderCard
        order={makeOrder({
          id: "runner-order-2",
          providerOrders: [
            {
              id: "provider-order-1",
              providerId: "provider-1",
              status: "READY_FOR_PICKUP",
              paymentStatus: "PAID",
              subtotal: 20,
              originalSubtotal: 20,
              discountAmount: 0,
              items: [],
            },
            {
              id: "provider-order-2",
              providerId: "provider-2",
              status: "READY_FOR_PICKUP",
              paymentStatus: "PAID",
              subtotal: 12,
              originalSubtotal: 12,
              discountAmount: 0,
              items: [],
            },
          ],
        })}
        onAccept={onAccept}
        disabled
      />,
    )

    expect(screen.getByText(/Ruta Multi-Pickup/i)).toBeInTheDocument()
    expect(screen.getByText(/2 Tiendas/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Aceptar Pedido/i })).toBeDisabled()
    expect(screen.getByText(/5.50 €/i)).toBeInTheDocument()
  })
})
