import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"

const loadStripeMock = vi.fn()
const confirmPaymentMock = vi.fn()
const toastSuccessMock = vi.fn()
const toastErrorMock = vi.fn()
const toastInfoMock = vi.fn()
const getPublicRuntimeConfigMock = vi.fn()

vi.mock("@stripe/stripe-js", () => ({
  loadStripe: (...args: unknown[]) => loadStripeMock(...args),
}))

vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PaymentElement: () => <div>payment-element</div>,
  useStripe: () => ({
    confirmPayment: (...args: unknown[]) => confirmPaymentMock(...args),
  }),
  useElements: () => ({}),
}))

vi.mock("next-intl", () => ({
  useLocale: () => "es-ES",
}))

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
    info: (...args: unknown[]) => toastInfoMock(...args),
  },
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, asChild, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) =>
    asChild ? <>{children}</> : <button {...rest}>{children}</button>,
}))

vi.mock("@/lib/runtime-config", () => ({
  getPublicRuntimeConfig: (...args: unknown[]) => getPublicRuntimeConfigMock(...args),
}))

describe("StripeDirectCheckout", () => {
  beforeEach(() => {
    vi.useRealTimers()
    loadStripeMock.mockReset()
    confirmPaymentMock.mockReset()
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
    toastInfoMock.mockReset()
    getPublicRuntimeConfigMock.mockReset()
    loadStripeMock.mockResolvedValue({})
  })

  it("loads the runtime publishable key and confirms a successful payment", async () => {
    getPublicRuntimeConfigMock.mockResolvedValueOnce({
      apiBaseUrl: "/api",
      stripePublishableKey: "pk_test_demo",
      requireMfa: false,
    })
    confirmPaymentMock.mockResolvedValueOnce({
      paymentIntent: { status: "succeeded" },
    })
    const onPaymentSuccess = vi.fn()

    const { StripeDirectCheckout } = await import(
      "@/components/payments/stripe-direct-checkout"
    )
    render(
      <StripeDirectCheckout
        clientSecret="pi_123_secret_456"
        stripeAccountId="acct_demo"
        totalAmount={19.95}
        onPaymentSuccess={onPaymentSuccess}
      />,
    )

    await waitFor(() => {
      expect(loadStripeMock).toHaveBeenCalledWith("pk_test_demo", {
        stripeAccount: "acct_demo",
      })
    })

    expect(screen.getByText("payment-element")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /Pagar 19,95/i }))

    await waitFor(() => {
      expect(confirmPaymentMock).toHaveBeenCalled()
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "Pago confirmado para este comercio.",
      )
      expect(onPaymentSuccess).toHaveBeenCalled()
    })
  })

  it("surfaces stripe payment errors", async () => {
    confirmPaymentMock.mockResolvedValueOnce({
      error: { message: "Tarjeta rechazada" },
    })

    const { StripeDirectCheckout } = await import(
      "@/components/payments/stripe-direct-checkout"
    )
    render(
      <StripeDirectCheckout
        clientSecret="pi_123_secret_456"
        stripeAccountId="acct_demo"
        totalAmount={12}
        onPaymentSuccess={vi.fn()}
        publishableKey="pk_test_direct"
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: /Pagar 12,00/i }))

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("Tarjeta rechazada")
    })
  })

  it("keeps the form mounted and informs when the payment requires extra action or is processing", async () => {
    vi.useFakeTimers()
    confirmPaymentMock
      .mockResolvedValueOnce({
        paymentIntent: { status: "requires_action" },
      })
      .mockResolvedValueOnce({
        paymentIntent: { status: "processing" },
      })

    const { StripeDirectCheckout } = await import(
      "@/components/payments/stripe-direct-checkout"
    )
    render(
      <StripeDirectCheckout
        clientSecret="pi_123_secret_456"
        stripeAccountId="acct_demo"
        totalAmount={9}
        onPaymentSuccess={vi.fn()}
        publishableKey="pk_test_direct"
      />,
    )

    const submit = screen.getByRole("button", { name: /Pagar 9,00/i })
    fireEvent.click(submit)
    await Promise.resolve()
    await Promise.resolve()
    expect(toastInfoMock).toHaveBeenCalledWith(
      "El pago requiere una validación adicional.",
    )

    await act(async () => {
      vi.advanceTimersByTime(5000)
      await Promise.resolve()
    })

    fireEvent.click(screen.getByRole("button", { name: /Pagar 9,00/i }))
    await Promise.resolve()
    await Promise.resolve()
    expect(toastInfoMock).toHaveBeenCalledWith("El pago está en proceso.")
  })
})
