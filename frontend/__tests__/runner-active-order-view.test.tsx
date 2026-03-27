import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import type { Order, ProviderOrder } from "@/lib/types"

const onInTransitMock = vi.fn()
const onCompleteMock = vi.fn()

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
    providerName: "Cerámica Norte",
    status: "READY_FOR_PICKUP",
    paymentStatus: "PAYMENT_PENDING",
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
          name: "Cuenco",
          description: "desc",
          price: 18,
          stock: 4,
          city: "Sevilla",
          category: "Cerámica",
          providerId: "provider-1",
          provider: { name: "Cerámica Norte" },
          createdAt: "2026-03-24T10:00:00.000Z",
        },
      },
    ],
    createdAt: "2026-03-24T10:00:00.000Z",
    updatedAt: "2026-03-24T10:00:00.000Z",
    ...overrides,
  }
}

function makeOrder(overrides: Partial<Order>): Order {
  return {
    id: "order-1",
    userId: "runner-1",
    total: 40,
    deliveryFee: 6.5,
    status: "ASSIGNED",
    createdAt: "2026-03-24T10:00:00.000Z",
    items: [],
    providerOrders: [],
    deliveryAddress: "Calle Feria 12",
    ...overrides,
  }
}

describe("RunnerActiveOrderView operational experience", () => {
  it("blocks final delivery start while pickups are still pending", async () => {
    const order = makeOrder({
      status: "ASSIGNED",
      providerOrders: [
        makeProviderOrder({ id: "po-1", status: "PREPARING" }),
        makeProviderOrder({ id: "po-2", providerId: "provider-2", status: "PICKED_UP" }),
      ],
    })

    const { RunnerActiveOrderView } = await import(
      "@/components/runner/RunnerActiveOrderView"
    )
    render(
      <RunnerActiveOrderView
        order={order}
        onInTransit={onInTransitMock}
        onComplete={onCompleteMock}
      />,
    )

    expect(screen.getByText("Ruta de Recogida")).toBeInTheDocument()
    expect(
      screen.getByText(/Pendiente de confirmación de recogida por las tiendas/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Pendiente de confirmación de recogida por las tiendas \(1\/2\)/i),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /Iniciar Entrega/i }),
    ).not.toBeInTheDocument()
  })

  it("lets the runner move to delivery mode once every pickup is confirmed", async () => {
    onInTransitMock.mockReset()

    const order = makeOrder({
      status: "ASSIGNED",
      providerOrders: [
        makeProviderOrder({ id: "po-1", status: "PICKED_UP" }),
        makeProviderOrder({ id: "po-2", providerId: "provider-2", status: "PICKED_UP" }),
      ],
    })

    const { RunnerActiveOrderView } = await import(
      "@/components/runner/RunnerActiveOrderView"
    )
    render(
      <RunnerActiveOrderView
        order={order}
        onInTransit={onInTransitMock}
        onComplete={onCompleteMock}
      />,
    )

    fireEvent.click(
      screen.getByRole("button", { name: /Todas las bolsas listas\. Iniciar Entrega/i }),
    )

    expect(onInTransitMock).toHaveBeenCalledWith("order-1")
  })

  it("shows final handoff mode and lets the runner complete the order", async () => {
    onCompleteMock.mockReset()

    const order = makeOrder({
      status: "IN_TRANSIT",
      providerOrders: [
        makeProviderOrder({ id: "po-1", status: "PICKED_UP" }),
        makeProviderOrder({ id: "po-2", providerId: "provider-2", status: "PICKED_UP" }),
      ],
    })

    const { RunnerActiveOrderView } = await import(
      "@/components/runner/RunnerActiveOrderView"
    )
    render(
      <RunnerActiveOrderView
        order={order}
        onInTransit={onInTransitMock}
        onComplete={onCompleteMock}
      />,
    )

    expect(screen.getByText("Entrega al Cliente")).toBeInTheDocument()
    expect(screen.getByText("Calle Feria 12")).toBeInTheDocument()
    expect(screen.getByText(/Entregar 2 paquete\(s\)/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /Marcar Entregado/i }))

    expect(onCompleteMock).toHaveBeenCalledWith("order-1")
  })
})
