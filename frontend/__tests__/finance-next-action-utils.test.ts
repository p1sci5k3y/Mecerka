import { describe, expect, it } from "vitest"
import { getProviderFinanceNextActionSummary } from "@/components/provider/provider-finance-next-action"
import { getRunnerFinanceNextActionSummary } from "@/components/runner/runner-finance-next-action"

describe("finance next action helpers", () => {
  describe("getProviderFinanceNextActionSummary", () => {
    it("prioritizes stripe connection when the provider is not connected", () => {
      expect(
        getProviderFinanceNextActionSummary({
          stripeConnected: false,
          paidOrderCount: 2,
          refundableOrderCount: 1,
          visibleRefundCount: 1,
          visibleIncidentCount: 1,
        }),
      ).toMatchObject({
        title: "Conectar cobro del comercio",
        tone: "warning",
      })
    })

    it("prioritizes support and refunds when the connector is ready", () => {
      expect(
        getProviderFinanceNextActionSummary({
          stripeConnected: true,
          paidOrderCount: 2,
          refundableOrderCount: 1,
          visibleRefundCount: 1,
          visibleIncidentCount: 0,
        }),
      ).toMatchObject({
        title: "Revisar soporte y devoluciones",
        tone: "warning",
      })
    })

    it("surfaces refundable orders when there is no visible support", () => {
      expect(
        getProviderFinanceNextActionSummary({
          stripeConnected: true,
          paidOrderCount: 2,
          refundableOrderCount: 2,
          visibleRefundCount: 0,
          visibleIncidentCount: 0,
        }),
      ).toMatchObject({
        title: "Vigilar pedidos reembolsables",
        tone: "info",
      })
    })

    it("marks the finance flow as consolidated when paid orders are already clean", () => {
      expect(
        getProviderFinanceNextActionSummary({
          stripeConnected: true,
          paidOrderCount: 2,
          refundableOrderCount: 0,
          visibleRefundCount: 0,
          visibleIncidentCount: 0,
        }),
      ).toMatchObject({
        title: "Cobros del comercio consolidados",
        tone: "success",
      })
    })

    it("falls back to waiting for first visible payments", () => {
      expect(
        getProviderFinanceNextActionSummary({
          stripeConnected: true,
          paidOrderCount: 0,
          refundableOrderCount: 0,
          visibleRefundCount: 0,
          visibleIncidentCount: 0,
        }),
      ).toMatchObject({
        title: "Esperar primeros cobros visibles",
        tone: "info",
      })
    })
  })

  describe("getRunnerFinanceNextActionSummary", () => {
    it("prioritizes missing Stripe Connect", () => {
      expect(
        getRunnerFinanceNextActionSummary({
          connectStatus: null,
          paidOrderCount: 1,
          pendingOrderCount: 1,
          visibleRefundCount: 1,
          visibleIncidentCount: 1,
        }),
      ).toMatchObject({
        title: "Conectar cobro del runner",
        tone: "warning",
      })
    })

    it("surfaces onboarding-required and review-required states", () => {
      expect(
        getRunnerFinanceNextActionSummary({
          connectStatus: {
            provider: "STRIPE",
            ownerType: "RUNNER",
            status: "ONBOARDING_REQUIRED",
            accountId: "acct_pending",
            configured: true,
            detailsSubmitted: false,
            chargesEnabled: false,
            payoutsEnabled: false,
            paymentAccountActive: false,
            requirementsDue: [],
            requirementsDisabledReason: null,
          },
          paidOrderCount: 0,
          pendingOrderCount: 0,
          visibleRefundCount: 0,
          visibleIncidentCount: 0,
        }),
      ).toMatchObject({
        title: "Completar onboarding de cobro",
        tone: "warning",
      })

      expect(
        getRunnerFinanceNextActionSummary({
          connectStatus: {
            provider: "STRIPE",
            ownerType: "RUNNER",
            status: "REVIEW_REQUIRED",
            accountId: "acct_review",
            configured: true,
            detailsSubmitted: true,
            chargesEnabled: false,
            payoutsEnabled: false,
            paymentAccountActive: false,
            requirementsDue: [],
            requirementsDisabledReason: "requirements.past_due",
          },
          paidOrderCount: 0,
          pendingOrderCount: 0,
          visibleRefundCount: 0,
          visibleIncidentCount: 0,
        }),
      ).toMatchObject({
        title: "Revisar restricciones de Stripe",
        tone: "warning",
      })
    })

    it("prioritizes support before pending payouts once connect is ready", () => {
      expect(
        getRunnerFinanceNextActionSummary({
          connectStatus: {
            provider: "STRIPE",
            ownerType: "RUNNER",
            status: "READY",
            accountId: "acct_ready",
            configured: true,
            detailsSubmitted: true,
            chargesEnabled: true,
            payoutsEnabled: true,
            paymentAccountActive: true,
            requirementsDue: [],
            requirementsDisabledReason: null,
          },
          paidOrderCount: 1,
          pendingOrderCount: 2,
          visibleRefundCount: 1,
          visibleIncidentCount: 0,
        }),
      ).toMatchObject({
        title: "Priorizar soporte económico",
        tone: "warning",
      })
    })

    it("surfaces pending payouts when the circuit is healthy but not settled yet", () => {
      expect(
        getRunnerFinanceNextActionSummary({
          connectStatus: {
            provider: "STRIPE",
            ownerType: "RUNNER",
            status: "READY",
            accountId: "acct_ready",
            configured: true,
            detailsSubmitted: true,
            chargesEnabled: true,
            payoutsEnabled: true,
            paymentAccountActive: true,
            requirementsDue: [],
            requirementsDisabledReason: null,
          },
          paidOrderCount: 1,
          pendingOrderCount: 2,
          visibleRefundCount: 0,
          visibleIncidentCount: 0,
        }),
      ).toMatchObject({
        title: "Seguir cobros pendientes",
        tone: "info",
      })
    })

    it("marks the runner finance flow as healthy when paid orders are already settled", () => {
      expect(
        getRunnerFinanceNextActionSummary({
          connectStatus: {
            provider: "STRIPE",
            ownerType: "RUNNER",
            status: "READY",
            accountId: "acct_ready",
            configured: true,
            detailsSubmitted: true,
            chargesEnabled: true,
            payoutsEnabled: true,
            paymentAccountActive: true,
            requirementsDue: [],
            requirementsDisabledReason: null,
          },
          paidOrderCount: 2,
          pendingOrderCount: 0,
          visibleRefundCount: 0,
          visibleIncidentCount: 0,
        }),
      ).toMatchObject({
        title: "Liquidaciones del runner encaminadas",
        tone: "success",
      })
    })

    it("falls back to waiting for first visible payouts", () => {
      expect(
        getRunnerFinanceNextActionSummary({
          connectStatus: {
            provider: "STRIPE",
            ownerType: "RUNNER",
            status: "READY",
            accountId: "acct_ready",
            configured: true,
            detailsSubmitted: true,
            chargesEnabled: true,
            payoutsEnabled: true,
            paymentAccountActive: true,
            requirementsDue: [],
            requirementsDisabledReason: null,
          },
          paidOrderCount: 0,
          pendingOrderCount: 0,
          visibleRefundCount: 0,
          visibleIncidentCount: 0,
        }),
      ).toMatchObject({
        title: "Esperar primeros cobros visibles",
        tone: "info",
      })
    })
  })
})
