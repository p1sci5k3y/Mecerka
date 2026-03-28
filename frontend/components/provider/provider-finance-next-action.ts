export type ProviderFinanceNextActionInput = {
  stripeConnected: boolean
  paidOrderCount: number
  refundableOrderCount: number
  visibleRefundCount: number
  visibleIncidentCount: number
}

export type ProviderFinanceNextActionSummary = {
  title: string
  description: string
  tone: "info" | "warning" | "success"
}

export function getProviderFinanceNextActionSummary({
  stripeConnected,
  paidOrderCount,
  refundableOrderCount,
  visibleRefundCount,
  visibleIncidentCount,
}: ProviderFinanceNextActionInput): ProviderFinanceNextActionSummary {
  if (!stripeConnected) {
    return {
      title: "Conectar cobro del comercio",
      description:
        "Antes de consolidar cobros reales conviene completar Stripe Connect. Sin esa conexión no podrás liquidar pedidos del comercio.",
      tone: "warning",
    }
  }

  if (visibleRefundCount > 0 || visibleIncidentCount > 0) {
    return {
      title: "Revisar soporte y devoluciones",
      description:
        "Hay señales económicas u operativas visibles asociadas a tus pedidos. Conviene revisar ventas y soporte antes de dar el flujo por cerrado.",
      tone: "warning",
    }
  }

  if (refundableOrderCount > 0) {
    return {
      title: "Vigilar pedidos reembolsables",
      description:
        refundableOrderCount > 1
          ? `Tienes ${refundableOrderCount} provider orders que podrían entrar en devolución. Mantén controlado su estado y el soporte asociado.`
          : "Tienes un provider order que podría entrar en devolución. Mantén vigilado su estado y el soporte asociado.",
      tone: "info",
    }
  }

  if (paidOrderCount > 0) {
    return {
      title: "Cobros del comercio consolidados",
      description:
        "Los cobros visibles ya están encaminados. El siguiente paso es seguir conciliación y nuevas ventas sin incidencias abiertas.",
      tone: "success",
    }
  }

  return {
    title: "Esperar primeros cobros visibles",
    description:
      "Todavía no hay provider orders cobrados en este centro. El siguiente paso es cerrar ventas y dejar Stripe listo para liquidaciones reales.",
    tone: "info",
  }
}
