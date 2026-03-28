import { describe, expect, it } from "vitest"
import {
  getAdminRefundCaseNextActionSummary,
  getAdminRefundQueueNextActionSummary,
} from "@/components/admin/admin-refund-next-action"
import { getAdminIncidentCaseNextActionSummary } from "@/components/admin/admin-incident-next-action"

describe("admin next action helpers", () => {
  it("prioritizes requested refunds in the queue", () => {
    expect(
      getAdminRefundQueueNextActionSummary([
        { status: "REQUESTED" },
        { status: "UNDER_REVIEW" },
      ] as never),
    ).toMatchObject({
      title: "Priorizar solicitudes nuevas",
      tone: "warning",
    })
  })

  it("falls through queue priorities until the queue is stable", () => {
    expect(
      getAdminRefundQueueNextActionSummary([{ status: "APPROVED" }] as never),
    ).toMatchObject({
      title: "Ejecutar devoluciones aprobadas",
      tone: "info",
    })

    expect(
      getAdminRefundQueueNextActionSummary([{ status: "FAILED" }] as never),
    ).toMatchObject({
      title: "Revisar fallos de ejecución",
      tone: "warning",
    })

    expect(
      getAdminRefundQueueNextActionSummary([{ status: "COMPLETED" }] as never),
    ).toMatchObject({
      title: "Cola económica estabilizada",
      tone: "success",
    })
  })

  it("maps refund case next actions by lifecycle status", () => {
    expect(
      getAdminRefundCaseNextActionSummary({
        status: "REQUESTED",
      }),
    ).toMatchObject({
      title: "Abrir revisión del caso",
      tone: "warning",
    })

    expect(
      getAdminRefundCaseNextActionSummary({
        status: "UNDER_REVIEW",
        incidentId: "incident-1",
      }),
    ).toMatchObject({
      title: "Resolver decisión económica",
      tone: "info",
    })

    expect(
      getAdminRefundCaseNextActionSummary({
        status: "FAILED",
      }),
    ).toMatchObject({
      title: "Revisar fallo de devolución",
      tone: "warning",
    })

    expect(
      getAdminRefundCaseNextActionSummary({
        status: "COMPLETED",
      }),
    ).toMatchObject({
      title: "Caso económico cerrado",
      tone: "success",
    })
  })

  it("maps incident case next actions by lifecycle status", () => {
    expect(
      getAdminIncidentCaseNextActionSummary({
        status: "OPEN",
      }),
    ).toMatchObject({
      title: "Abrir revisión operativa",
      tone: "warning",
    })

    expect(
      getAdminIncidentCaseNextActionSummary({
        status: "UNDER_REVIEW",
        evidenceUrl: "https://example.com/evidence.jpg",
      }),
    ).toMatchObject({
      title: "Cerrar decisión del caso",
      tone: "info",
    })

    expect(
      getAdminIncidentCaseNextActionSummary({
        status: "REJECTED",
      }),
    ).toMatchObject({
      title: "Caso operativo cerrado sin continuidad",
      tone: "success",
    })
  })
})
