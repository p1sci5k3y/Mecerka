import { api } from "@/lib/api"

export const demoService = {
  async confirmProviderOrderPayment(providerOrderId: string) {
    return api.post(`/demo/payments/provider-order/${providerOrderId}/confirm`)
  },

  async confirmRunnerPayment(deliveryOrderId: string) {
    return api.post(`/demo/payments/delivery-order/${deliveryOrderId}/confirm`)
  },
}
