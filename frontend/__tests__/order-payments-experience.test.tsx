import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type {
  Order,
  OrderProviderPaymentsAggregate,
  ProviderOrder,
} from "@/lib/types"

const mockUseParams = vi.fn()
const routerPushMock = vi.fn()
const routerReplaceMock = vi.fn()
const getOneMock = vi.fn()
const prepareOrderProviderPaymentsMock = vi.fn()
const prepareProviderOrderPaymentMock = vi.fn()
const prepareRunnerPaymentMock = vi.fn()
const useAuthMock = vi.fn()
const getPublicRuntimeConfigMock = vi.fn()
const toastInfoMock = vi.fn()
const toastErrorMock = vi.fn()

vi.mock("next/navigation", () => ({
  useParams: () => mockUseParams(),
}))

vi.mock("@/lib/navigation", () => ({
  useRouter: () => ({
    push: routerPushMock,
    replace: routerReplaceMock,
  }),
  usePathname: () => "/orders/order-1/payments",
}))

vi.mock("@/lib/services/orders-service", () => ({
  ordersService: {
    getOne: (...args: unknown[]) => getOneMock(...args),
  },
}))

vi.mock("@/lib/services/payments-service", () => ({
  paymentsService: {
    prepareOrderProviderPayments: (...args: unknown[]) =>
      prepareOrderProviderPaymentsMock(...args),
    prepareProviderOrderPayment: (...args: unknown[]) =>
      prepareProviderOrderPaymentMock(...args),
    prepareRunnerPayment: (...args: unknown[]) =>
      prepareRunnerPaymentMock(...args),
  },
}))

vi.mock("@/lib/runtime-config", () => ({
  getPublicRuntimeConfig: (...args: unknown[]) =>
    getPublicRuntimeConfigMock(...args),
}))

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => useAuthMock(),
}))

vi.mock("@/components/navbar", () => ({
  Navbar: () => <nav data-testid="navbar" />,
}))

vi.mock("@/components/footer", () => ({
  Footer: () => <footer data-testid="footer" />,
}))

vi.mock("@/components/payments/stripe-direct-checkout", () => ({
  StripeDirectCheckout: () => <div data-testid="stripe-direct-checkout" />,
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    asChild,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) =>
    asChild ? <>{children}</> : <button {...rest}>{children}</button>,
}))

vi.mock("sonner", () => ({
  toast: {
    info: (...args: unknown[]) => toastInfoMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}))

function makeProviderOrder(
  overrides: Partial<ProviderOrder>,
): ProviderOrder {
  return {
    id: "provider-order-1",
    providerId: "provider-1",
    providerName: "Cerámica Norte",
    status: "PREPARING",
    paymentStatus: "PAYMENT_PENDING",
    subtotal: 18,
    originalSubtotal: 22,
    discountAmount: 4,
    items: [],
    createdAt: "2026-03-24T10:00:00.000Z",
    updatedAt: "2026-03-24T11:00:00.000Z",
    ...overrides,
  }
}

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    userId: "client-1",
    total: 42,
    deliveryFee: 6.5,
    status: "CONFIRMED",
    createdAt: "2026-03-24T10:00:00.000Z",
    updatedAt: "2026-03-24T11:00:00.000Z",
    items: [],
    providerOrders: [
      makeProviderOrder({ id: "provider-order-1" }),
      makeProviderOrder({
        id: "provider-order-2",
        providerId: "provider-2",
        providerName: "Cuero Sur",
        status: "READY_FOR_PICKUP",
        paymentStatus: "PAID",
        subtotal: 24,
        originalSubtotal: 24,
        discountAmount: 0,
      }),
    ],
    deliveryOrder: {
      id: "delivery-1",
      runnerId: "runner-1",
      status: "ASSIGNED",
      paymentStatus: "PAYMENT_PENDING",
    },
    deliveryAddress: "Calle Feria 12",
    postalCode: "41003",
    deliveryDistanceKm: 4,
    runnerBaseFee: 3.5,
    runnerPerKmFee: 0.5,
    runnerExtraPickupFee: 1,
    ...overrides,
  }
}

function makeAggregate(
  overrides: Partial<OrderProviderPaymentsAggregate> = {},
): OrderProviderPaymentsAggregate {
  return {
    orderId: "order-1",
    orderStatus: "CONFIRMED",
    paymentMode: "PROVIDER_ORDER_SESSIONS",
    paymentEnvironment: "READY",
    paymentEnvironmentMessage: null,
    providerPaymentStatus: "PARTIALLY_PAID",
    paidProviderOrders: 1,
    totalProviderOrders: 2,
    providerOrders: [
      {
        providerOrderId: "provider-order-1",
        providerId: "provider-1",
        providerName: "Cerámica Norte",
        subtotalAmount: 18,
        originalSubtotalAmount: 22,
        discountAmount: 4,
        status: "PREPARING",
        paymentStatus: "PAYMENT_PENDING",
        paymentRequired: true,
        paymentSession: null,
      },
      {
        providerOrderId: "provider-order-2",
        providerId: "provider-2",
        providerName: "Cuero Sur",
        subtotalAmount: 24,
        originalSubtotalAmount: 24,
        discountAmount: 0,
        status: "READY_FOR_PICKUP",
        paymentStatus: "PAID",
        paymentRequired: false,
        paymentSession: null,
      },
    ],
    runnerPayment: {
      paymentMode: "DELIVERY_ORDER_SESSION",
      deliveryOrderId: "delivery-1",
      runnerId: "runner-1",
      deliveryStatus: "ASSIGNED",
      paymentStatus: "PAYMENT_PENDING",
      paymentRequired: true,
      sessionPrepared: false,
      amount: 6.5,
      currency: "EUR",
      pricingDistanceKm: 4,
      pickupCount: 2,
      additionalPickupCount: 1,
      baseFee: 3.5,
      perKmFee: 0.5,
      distanceFee: 2,
      extraPickupFee: 1,
      extraPickupCharge: 1,
    },
    ...overrides,
  }
}

describe("OrderPaymentsPage experience", () => {
  beforeEach(() => {
    mockUseParams.mockReturnValue({ id: "order-1" })
    routerPushMock.mockReset()
    routerReplaceMock.mockReset()
    getOneMock.mockReset()
    prepareOrderProviderPaymentsMock.mockReset()
    prepareProviderOrderPaymentMock.mockReset()
    prepareRunnerPaymentMock.mockReset()
    getPublicRuntimeConfigMock.mockReset()
    toastInfoMock.mockReset()
    toastErrorMock.mockReset()
    useAuthMock.mockReturnValue({
      user: {
        userId: "client-1",
        roles: ["CLIENT"],
        mfaEnabled: true,
        hasPin: true,
      },
      isAuthenticated: true,
      isLoading: false,
    })
    getPublicRuntimeConfigMock.mockResolvedValue({
      stripePublishableKey: "pk_test_realistic",
    })
  })

  it("shows split provider payments and the separate runner formula", async () => {
    getOneMock.mockResolvedValueOnce(makeOrder())
    prepareOrderProviderPaymentsMock.mockResolvedValueOnce(makeAggregate())

    const Page = (await import("@/app/[locale]/orders/[id]/payments/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("Pedido y pagos por comercio")).toBeInTheDocument()
    })

    expect(screen.getByText("1 de 2 cubiertos")).toBeInTheDocument()
    expect(screen.getByText("Cerámica Norte")).toBeInTheDocument()
    expect(screen.getByText("Cuero Sur")).toBeInTheDocument()
    expect(screen.getByText(/Descuento aplicado por este comercio/i)).toBeInTheDocument()
    expect(screen.getByText("Pago separado del reparto")).toBeInTheDocument()
    expect(screen.getByText(/Fórmula oficial del reparto/i)).toBeInTheDocument()
    expect(screen.getByText(/Distancia considerada:/i)).toBeInTheDocument()
    expect(screen.getByText(/Recogidas:/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Preparar pago de reparto/i })).toBeInTheDocument()
  })

  it("communicates safely when Stripe is unavailable but the economic split remains valid", async () => {
    getOneMock.mockResolvedValueOnce(makeOrder())
    prepareOrderProviderPaymentsMock.mockResolvedValueOnce(
      makeAggregate({
        paymentEnvironment: "UNAVAILABLE",
        paymentEnvironmentMessage: "Stripe no está habilitado en demo.",
        runnerPayment: {
          paymentMode: "DELIVERY_ORDER_SESSION",
          deliveryOrderId: null,
          runnerId: null,
          deliveryStatus: null,
          paymentStatus: "NOT_CREATED",
          paymentRequired: false,
          sessionPrepared: false,
          amount: 6.5,
          currency: "EUR",
          pricingDistanceKm: 4,
          pickupCount: 2,
          additionalPickupCount: 1,
          baseFee: 3.5,
          perKmFee: 0.5,
          distanceFee: 2,
          extraPickupFee: 1,
          extraPickupCharge: 1,
        },
      }),
    )

    const Page = (await import("@/app/[locale]/orders/[id]/payments/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(
        screen.getByText("Este entorno no puede completar el cobro Stripe real."),
      ).toBeInTheDocument()
    })

    expect(
      screen.getByText(/La estructura económica del pedido sigue siendo válida/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/el runner sigue siendo un pago separado y visible/i),
    ).toBeInTheDocument()
  })

  it("redirects guests back to login preserving the return target", async () => {
    useAuthMock.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    })
    getPublicRuntimeConfigMock.mockResolvedValue({
      stripePublishableKey: "pk_test_realistic",
    })

    const Page = (await import("@/app/[locale]/orders/[id]/payments/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(routerReplaceMock).toHaveBeenCalledWith(
        "/login?returnTo=%2Forders%2Forder-1%2Fpayments",
      )
    })
  })

  it("redirects non-client users away from the payment page", async () => {
    useAuthMock.mockReturnValue({
      user: {
        userId: "runner-1",
        roles: ["RUNNER"],
        mfaEnabled: true,
        hasPin: true,
      },
      isAuthenticated: true,
      isLoading: false,
    })

    const Page = (await import("@/app/[locale]/orders/[id]/payments/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(routerReplaceMock).toHaveBeenCalledWith("/dashboard")
    })
  })

  it("prepares a provider payment session and opens the direct checkout", async () => {
    getOneMock.mockResolvedValueOnce(makeOrder())
    prepareOrderProviderPaymentsMock.mockResolvedValueOnce(makeAggregate())
    prepareProviderOrderPaymentMock.mockResolvedValueOnce({
      providerOrderId: "provider-order-1",
      paymentSessionId: "session-1",
      externalSessionId: null,
      clientSecret: "secret_provider",
      stripeAccountId: "acct_provider",
      expiresAt: null,
      paymentStatus: "PAYMENT_READY",
    })

    const Page = (await import("@/app/[locale]/orders/[id]/payments/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Preparar pago de este comercio/i }),
      ).toBeInTheDocument()
    })

    fireEvent.click(
      screen.getByRole("button", { name: /Preparar pago de este comercio/i }),
    )

    await waitFor(() => {
      expect(prepareProviderOrderPaymentMock).toHaveBeenCalledWith(
        "provider-order-1",
      )
    })

    expect(screen.getByTestId("stripe-direct-checkout")).toBeInTheDocument()
  })

  it("prepares runner payment and degrades safely when Stripe cannot complete locally", async () => {
    getPublicRuntimeConfigMock.mockResolvedValue({
      stripePublishableKey: "pk_test_dummy",
    })
    getOneMock.mockResolvedValueOnce(makeOrder())
    prepareOrderProviderPaymentsMock.mockResolvedValueOnce(makeAggregate())
    prepareRunnerPaymentMock.mockResolvedValueOnce({
      deliveryOrderId: "delivery-1",
      runnerPaymentSessionId: "runner-session-1",
      externalSessionId: null,
      clientSecret: "runner_secret",
      stripeAccountId: "acct_runner",
      expiresAt: null,
      paymentStatus: "PAYMENT_READY",
    })

    const Page = (await import("@/app/[locale]/orders/[id]/payments/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Preparar pago de reparto/i }),
      ).toBeInTheDocument()
    })

    fireEvent.click(
      screen.getByRole("button", { name: /Preparar pago de reparto/i }),
    )

    await waitFor(() => {
      expect(prepareRunnerPaymentMock).toHaveBeenCalledWith("delivery-1")
    })

    expect(toastInfoMock).toHaveBeenCalledWith(
      "El pago del reparto está separado y preparado, pero este entorno local no puede completar Stripe.",
    )
  })

  it("refreshes payment status on demand", async () => {
    getOneMock
      .mockResolvedValueOnce(makeOrder())
      .mockResolvedValueOnce(makeOrder({ status: "DELIVERED" }))
    prepareOrderProviderPaymentsMock
      .mockResolvedValueOnce(makeAggregate())
      .mockResolvedValueOnce(makeAggregate({ orderStatus: "DELIVERED" }))

    const Page = (await import("@/app/[locale]/orders/[id]/payments/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("1 de 2 cubiertos")).toBeInTheDocument()
    })

    fireEvent.click(
      screen.getByRole("button", { name: /Actualizar estado de pagos/i }),
    )

    await waitFor(() => {
      expect(getOneMock).toHaveBeenCalledTimes(2)
      expect(prepareOrderProviderPaymentsMock).toHaveBeenCalledTimes(2)
    })
  })
})
