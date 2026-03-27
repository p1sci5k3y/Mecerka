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
const confirmDemoProviderOrderPaymentMock = vi.fn()
const confirmDemoRunnerPaymentMock = vi.fn()
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

vi.mock("@/lib/services/demo-service", () => ({
  demoService: {
    confirmProviderOrderPayment: (...args: unknown[]) =>
      confirmDemoProviderOrderPaymentMock(...args),
    confirmRunnerPayment: (...args: unknown[]) => confirmDemoRunnerPaymentMock(...args),
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
  StripeDirectCheckout: ({
    onPaymentSuccess,
  }: {
    onPaymentSuccess?: () => void
  }) => (
    <div data-testid="stripe-direct-checkout">
      <button type="button" onClick={onPaymentSuccess}>
        complete-direct-checkout
      </button>
    </div>
  ),
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
    confirmDemoProviderOrderPaymentMock.mockReset()
    confirmDemoRunnerPaymentMock.mockReset()
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

  it("completes provider and runner payments through the explicit demo flow when Stripe is dummy", async () => {
    getPublicRuntimeConfigMock.mockResolvedValue({
      stripePublishableKey: "pk_test_dummy",
    })
    getOneMock
      .mockResolvedValueOnce(makeOrder())
      .mockResolvedValueOnce(
        makeOrder({
          providerOrders: [
            makeProviderOrder({
              id: "provider-order-1",
              paymentStatus: "PAID",
              status: "READY_FOR_PICKUP",
            }),
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
        }),
      )
      .mockResolvedValueOnce(
        makeOrder({
          providerOrders: [
            makeProviderOrder({
              id: "provider-order-1",
              paymentStatus: "PAID",
              status: "READY_FOR_PICKUP",
            }),
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
            paymentStatus: "PAID",
          },
        }),
      )
    prepareOrderProviderPaymentsMock
      .mockResolvedValueOnce(
        makeAggregate({
          paymentEnvironment: "UNAVAILABLE",
          paymentEnvironmentMessage: "Stripe no está habilitado en demo.",
        }),
      )
      .mockResolvedValueOnce(
        makeAggregate({
          paymentEnvironment: "UNAVAILABLE",
          paymentEnvironmentMessage: "Stripe no está habilitado en demo.",
          providerPaymentStatus: "PARTIALLY_PAID",
          paidProviderOrders: 2,
          providerOrders: [
            {
              providerOrderId: "provider-order-1",
              providerId: "provider-1",
              providerName: "Cerámica Norte",
              subtotalAmount: 18,
              originalSubtotalAmount: 22,
              discountAmount: 4,
              status: "READY_FOR_PICKUP",
              paymentStatus: "PAID",
              paymentRequired: false,
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
        }),
      )
      .mockResolvedValueOnce(
        makeAggregate({
          paymentEnvironment: "UNAVAILABLE",
          paymentEnvironmentMessage: "Stripe no está habilitado en demo.",
          providerPaymentStatus: "PAID",
          paidProviderOrders: 2,
          providerOrders: [
            {
              providerOrderId: "provider-order-1",
              providerId: "provider-1",
              providerName: "Cerámica Norte",
              subtotalAmount: 18,
              originalSubtotalAmount: 22,
              discountAmount: 4,
              status: "READY_FOR_PICKUP",
              paymentStatus: "PAID",
              paymentRequired: false,
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
            deliveryStatus: "PICKUP_PENDING",
            paymentStatus: "PAID",
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
    confirmDemoProviderOrderPaymentMock.mockResolvedValueOnce({ ok: true })
    confirmDemoRunnerPaymentMock.mockResolvedValueOnce({ ok: true })

    const Page = (await import("@/app/[locale]/orders/[id]/payments/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: /Completar pago demo de este comercio/i,
        }),
      ).toBeInTheDocument()
    })

    fireEvent.click(
      screen.getByRole("button", {
        name: /Completar pago demo de este comercio/i,
      }),
    )

    await waitFor(() => {
      expect(confirmDemoProviderOrderPaymentMock).toHaveBeenCalledWith(
        "provider-order-1",
      )
    })

    fireEvent.click(
      screen.getByRole("button", {
        name: /Completar pago demo de reparto/i,
      }),
    )

    await waitFor(() => {
      expect(confirmDemoRunnerPaymentMock).toHaveBeenCalledWith("delivery-1")
      expect(getOneMock).toHaveBeenCalledTimes(3)
      expect(prepareOrderProviderPaymentsMock).toHaveBeenCalledTimes(3)
    })
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

  it("keeps the page in loading mode while auth is still resolving", async () => {
    useAuthMock.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: true,
    })

    const Page = (await import("@/app/[locale]/orders/[id]/payments/page")).default
    render(<Page />)

    expect(screen.queryByTestId("navbar")).not.toBeInTheDocument()
    expect(document.querySelector(".animate-spin")).not.toBeNull()
    expect(getOneMock).not.toHaveBeenCalled()
    expect(prepareOrderProviderPaymentsMock).not.toHaveBeenCalled()
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
      screen.getAllByRole("button", { name: /Preparar pago de este comercio/i })[0],
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

  it("keeps provider preparation in a safe toast-only mode when the key is dummy and surfaces provider status variants", async () => {
    getPublicRuntimeConfigMock.mockResolvedValue({
      stripePublishableKey: "pk_test_dummy",
    })
    getOneMock.mockResolvedValueOnce(makeOrder())
    prepareOrderProviderPaymentsMock.mockResolvedValueOnce(
      makeAggregate({
        providerOrders: [
          {
            providerOrderId: "provider-order-1",
            providerId: "provider-1",
            providerName: "Cerámica Norte",
            subtotalAmount: 18,
            originalSubtotalAmount: 22,
            discountAmount: 4,
            status: "PREPARING",
            paymentStatus: "FAILED",
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
            paymentStatus: "PENDING",
            paymentRequired: true,
            paymentSession: null,
          },
        ],
      }),
    )
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
      expect(screen.getByText("Fallido")).toBeInTheDocument()
      expect(screen.getAllByText("Pendiente").length).toBeGreaterThan(0)
    })

    fireEvent.click(
      screen.getAllByRole("button", { name: /Preparar pago de este comercio/i })[0],
    )

    await waitFor(() => {
      expect(prepareProviderOrderPaymentMock).toHaveBeenCalledWith(
        "provider-order-1",
      )
    })

    expect(toastInfoMock).toHaveBeenCalledWith(
      "La sesión de pago ya está preparada en backend, pero este entorno local no puede completar Stripe.",
    )
  })

  it("falls back to local order data when the aggregate fails and surfaces generic demo-payment errors", async () => {
    getOneMock.mockResolvedValueOnce(
      makeOrder({
        providerOrders: [
          makeProviderOrder({
            id: "provider-order-1",
            providerName: "",
            providerId: "provider-xyz",
            items: [],
            paymentStatus: undefined,
            status: "REJECTED_BY_STORE",
          }),
        ],
      }),
    )
    prepareOrderProviderPaymentsMock.mockRejectedValueOnce({})
    getPublicRuntimeConfigMock.mockResolvedValueOnce({
      stripePublishableKey: null,
    })

    const Page = (await import("@/app/[locale]/orders/[id]/payments/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(
        screen.getByText(
          "No pudimos preparar las sesiones de pago para este pedido.",
        ),
      ).toBeInTheDocument()
    })

    expect(screen.getByText("Proveedor provid")).toBeInTheDocument()
    expect(screen.getByText("ASSIGNED")).toBeInTheDocument()
    expect(screen.getAllByText("Pendiente").length).toBeGreaterThan(0)
    expect(screen.getByText("No")).toBeInTheDocument()
  })

  it("refreshes the page after a successful direct checkout and keeps the catalog exit", async () => {
    getOneMock
      .mockResolvedValueOnce(makeOrder())
      .mockResolvedValueOnce(makeOrder())
    prepareOrderProviderPaymentsMock
      .mockResolvedValueOnce(makeAggregate())
      .mockResolvedValueOnce(makeAggregate())
    prepareRunnerPaymentMock.mockResolvedValueOnce({
      deliveryOrderId: "delivery-1",
      runnerPaymentSessionId: "runner-session-1",
      clientSecret: "secret_runner",
      stripeAccountId: "acct_runner",
      paymentStatus: "PAYMENT_READY",
    })

    const Page = (await import("@/app/[locale]/orders/[id]/payments/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Preparar pago de reparto/i }),
      ).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: /Preparar pago de reparto/i }))

    await waitFor(() => {
      expect(screen.getByTestId("stripe-direct-checkout")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: "complete-direct-checkout" }))

    await waitFor(() => {
      expect(getOneMock).toHaveBeenCalledTimes(2)
      expect(prepareOrderProviderPaymentsMock).toHaveBeenCalledTimes(2)
    })

    fireEvent.click(screen.getByRole("button", { name: /Seguir comprando/i }))
    expect(routerPushMock).toHaveBeenCalledWith("/products")
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

  it("keeps direct exits to order center and tracking", async () => {
    getOneMock.mockResolvedValueOnce(makeOrder())
    prepareOrderProviderPaymentsMock.mockResolvedValueOnce(makeAggregate())

    const Page = (await import("@/app/[locale]/orders/[id]/payments/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("Pedido y pagos por comercio")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: /Volver al detalle del pedido/i }))
    expect(routerPushMock).toHaveBeenCalledWith("/orders/order-1")

    fireEvent.click(screen.getByRole("button", { name: /Volver a mis pedidos/i }))
    expect(routerPushMock).toHaveBeenCalledWith("/orders")

    fireEvent.click(screen.getByRole("button", { name: /Ver mis pedidos/i }))
    expect(routerPushMock).toHaveBeenCalledWith("/orders")

    fireEvent.click(screen.getByRole("button", { name: /Seguir este pedido/i }))
    expect(routerPushMock).toHaveBeenCalledWith("/orders/order-1/track")
  })

  it("opens the provider checkout drawer when a reusable Stripe session already exists and refreshes after success", async () => {
    getOneMock
      .mockResolvedValueOnce(makeOrder())
      .mockResolvedValueOnce(makeOrder())
    prepareOrderProviderPaymentsMock
      .mockResolvedValueOnce(
        makeAggregate({
          providerOrders: [
            {
              providerOrderId: "provider-order-1",
              providerId: "provider-1",
              providerName: undefined,
              subtotalAmount: 18,
              originalSubtotalAmount: 18,
              discountAmount: 0,
              status: "PREPARING",
              paymentStatus: "PAYMENT_READY",
              paymentRequired: true,
              paymentSession: {
                providerOrderId: "provider-order-1",
                paymentSessionId: "provider-session-1",
                clientSecret: "secret_provider",
                stripeAccountId: "acct_provider",
                expiresAt: "2026-03-27T12:00:00.000Z",
                paymentStatus: "PAYMENT_READY",
              },
            },
          ],
          paidProviderOrders: 0,
          totalProviderOrders: 1,
          runnerPayment: {
            ...makeAggregate().runnerPayment,
            paymentRequired: false,
            paymentStatus: "PAID",
          },
        }),
      )
      .mockResolvedValueOnce(
        makeAggregate({
          providerOrders: [
            {
              providerOrderId: "provider-order-1",
              providerId: "provider-1",
              providerName: undefined,
              subtotalAmount: 18,
              originalSubtotalAmount: 18,
              discountAmount: 0,
              status: "PREPARING",
              paymentStatus: "PAID",
              paymentRequired: false,
              paymentSession: null,
            },
          ],
          paidProviderOrders: 1,
          totalProviderOrders: 1,
          providerPaymentStatus: "PAID",
          runnerPayment: {
            ...makeAggregate().runnerPayment,
            paymentRequired: false,
            paymentStatus: "PAID",
          },
        }),
      )

    const Page = (await import("@/app/[locale]/orders/[id]/payments/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Abrir formulario de pago/i }),
      ).toBeInTheDocument()
    })

    expect(screen.getByText(/Proveedor provid/i)).toBeInTheDocument()
    expect(screen.getByText(/Sesión preparada hasta/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /Abrir formulario de pago/i }))

    await waitFor(() => {
      expect(screen.getByTestId("stripe-direct-checkout")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: "complete-direct-checkout" }))

    await waitFor(() => {
      expect(getOneMock).toHaveBeenCalledTimes(2)
      expect(prepareOrderProviderPaymentsMock).toHaveBeenCalledTimes(2)
      expect(
        screen.getByText("Este pedido ya no tiene pagos pendientes."),
      ).toBeInTheDocument()
    })
  })

  it("surfaces a clear post-payment banner when the order is already economically covered", async () => {
    getOneMock.mockResolvedValueOnce(
      makeOrder({
        providerOrders: [
          makeProviderOrder({
            id: "provider-order-1",
            paymentStatus: "PAID",
            status: "READY_FOR_PICKUP",
          }),
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
          paymentStatus: "PAID",
        },
      }),
    )
    prepareOrderProviderPaymentsMock.mockResolvedValueOnce(
      makeAggregate({
        providerPaymentStatus: "PAID",
        paidProviderOrders: 2,
        providerOrders: [
          {
            providerOrderId: "provider-order-1",
            providerId: "provider-1",
            providerName: "Cerámica Norte",
            subtotalAmount: 18,
            originalSubtotalAmount: 22,
            discountAmount: 4,
            status: "READY_FOR_PICKUP",
            paymentStatus: "PAID",
            paymentRequired: false,
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
          paymentStatus: "PAID",
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
        screen.getByText("Este pedido ya no tiene pagos pendientes."),
      ).toBeInTheDocument()
    })

    expect(
      screen.getByText(/el circuito económico del pedido está cubierto/i),
    ).toBeInTheDocument()
  })

  it("surfaces a clear page error when the root order cannot be loaded", async () => {
    getOneMock.mockRejectedValueOnce(new Error("pedido caído"))

    const Page = (await import("@/app/[locale]/orders/[id]/payments/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(
        screen.getByText("pedido caído"),
      ).toBeInTheDocument()
    })
  })

  it("falls back to the order payload when aggregate preparation fails and keeps non-required provider payments closed", async () => {
    getOneMock.mockResolvedValueOnce(
      makeOrder({
        providerOrders: [
          makeProviderOrder({
            id: "provider-order-1",
            status: "DELIVERED",
            paymentStatus: "PAID",
          }),
        ],
        deliveryOrder: null,
      }),
    )
    prepareOrderProviderPaymentsMock.mockRejectedValueOnce(new Error("aggregate failed"))

    const Page = (await import("@/app/[locale]/orders/[id]/payments/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(
        screen.getByText(/Este entorno no puede completar el cobro Stripe real/i),
      ).toBeInTheDocument()
    })

    expect(screen.getByText("aggregate failed")).toBeInTheDocument()
    expect(
      screen.getByText("Este comercio ya no requiere cobro adicional en este pedido."),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /Preparar pago de este comercio/i }),
    ).not.toBeInTheDocument()
    expect(screen.getByText(/Sin runner asignado/i)).toBeInTheDocument()
  })
})
