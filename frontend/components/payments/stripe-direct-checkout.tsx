"use client"

import { useEffect, useState } from "react"
import { loadStripe } from "@stripe/stripe-js"
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useLocale } from "next-intl"
import { Button } from "@/components/ui/button"
import { getPublicRuntimeConfig } from "@/lib/runtime-config"

const stripePromises: Record<string, Promise<any>> = {}

function getStripe(publishableKey: string, accountId: string) {
  const cacheKey = `${publishableKey}:${accountId}`

  if (!stripePromises[cacheKey]) {
    stripePromises[cacheKey] = loadStripe(publishableKey, {
      stripeAccount: accountId,
    })
  }

  return stripePromises[cacheKey]
}

function CheckoutForm({
  onSuccess,
  totalToPay,
  currency = "EUR",
}: {
  onSuccess: () => void
  totalToPay: number
  currency?: string
}) {
  const locale = useLocale()
  const stripe = useStripe()
  const elements = useElements()
  const [isProcessing, setIsProcessing] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!stripe || !elements) {
      return
    }

    setIsProcessing(true)

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    })

    if (error) {
      toast.error(error.message || "No pudimos completar el pago.")
      setIsProcessing(false)
      return
    }

    if (paymentIntent?.status === "succeeded") {
      toast.success("Pago confirmado para este comercio.")
      onSuccess()
      return
    }

    if (paymentIntent?.status === "requires_action") {
      toast.info("El pago requiere una validación adicional.")
      setTimeout(() => setIsProcessing(false), 5000)
      return
    }

    if (paymentIntent?.status === "processing") {
      toast.info("El pago está en proceso.")
      setTimeout(() => setIsProcessing(false), 5000)
      return
    }

    setIsProcessing(false)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <PaymentElement />
      <Button
        type="submit"
        disabled={isProcessing || !stripe || !elements}
        size="lg"
        className="h-12 font-semibold"
      >
        {isProcessing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Procesando...
          </>
        ) : (
          `Pagar ${new Intl.NumberFormat(locale, {
            style: "currency",
            currency,
          }).format(totalToPay)}`
        )}
      </Button>
    </form>
  )
}

export function StripeDirectCheckout({
  clientSecret,
  stripeAccountId,
  totalAmount,
  onPaymentSuccess,
  publishableKey,
}: {
  clientSecret: string
  stripeAccountId: string
  totalAmount: number
  onPaymentSuccess: () => void
  publishableKey?: string | null
}) {
  const [runtimePublishableKey, setRuntimePublishableKey] = useState<string | null>(
    null,
  )
  const resolvedPublishableKey = publishableKey ?? runtimePublishableKey

  useEffect(() => {
    if (publishableKey) {
      return
    }

    let active = true
    void getPublicRuntimeConfig().then((config) => {
      if (active) {
        setRuntimePublishableKey(config.stripePublishableKey ?? null)
      }
    })

    return () => {
      active = false
    }
  }, [publishableKey])

  if (!resolvedPublishableKey) {
    return null
  }

  return (
    <Elements
      stripe={getStripe(resolvedPublishableKey, stripeAccountId)}
      options={{
        clientSecret,
        appearance: {
          theme: "stripe",
          variables: {
            colorPrimary: "#e07b61",
            colorBackground: "#ffffff",
            colorText: "#30313d",
            colorDanger: "#df1b41",
            fontFamily: "system-ui, sans-serif",
            spacingUnit: "4px",
            borderRadius: "12px",
          },
        },
      }}
    >
      <CheckoutForm onSuccess={onPaymentSuccess} totalToPay={totalAmount} />
    </Elements>
  )
}
