import { describe, expect, it, vi } from "vitest"
import {
  calculateDistanceKm,
  fetchProjectedRoute,
  formatDistanceLabel,
  formatEtaLabel,
  formatLastUpdateLabel,
  runnerTrackingStatusLabel,
} from "@/components/tracking/delivery-map-utils"
import { buildDeliveryMilestones } from "@/components/tracking/DeliveryProgressTimeline"
import {
  getPickupCoverageLabel,
  getRunnerAssignmentLabel,
  getTrackingSignalLabel,
  getTrackingSignalState,
} from "@/components/tracking/delivery-operational-health"
import {
  deliveryStatusLabel,
  incidentStatusLabel,
  pickupStatusLabel,
  refundStatusLabel,
  runnerPaymentLabel,
  shouldShowRouteMap,
} from "@/components/runner/runner-order-detail-utils"

describe("tracking and runner detail utils", () => {
  it("formats tracking labels and distances safely", () => {
    expect(formatDistanceLabel(null)).toBe("Sin estimación")
    expect(formatDistanceLabel(0.42)).toBe("420 m")
    expect(formatDistanceLabel(3.43)).toBe("3.4 km")
    expect(formatEtaLabel(null)).toBe("Pendiente de GPS")
    expect(formatEtaLabel(3)).toBe("10 min aprox.")
    expect(runnerTrackingStatusLabel("PICKUP_PENDING")).toBe("Ruta lista para recogida")
    expect(runnerTrackingStatusLabel("DELIVERED")).toBe("Ruta cerrada por entrega completada")
    expect(runnerTrackingStatusLabel("UNKNOWN")).toBe("Esperando contexto operativo")
  })

  it("formats last update and computes route distance", () => {
    expect(formatLastUpdateLabel(null)).toBe("Sin señal todavía")
    expect(formatLastUpdateLabel("2026-03-28T10:00:00.000Z")).toMatch(/^\d{2}:\d{2}$/)
    expect(calculateDistanceKm(40.4168, -3.7038, 40.5100, -3.6100)).toBeGreaterThan(10)
  })

  it("fetches projected route data and degrades to null when routing fails", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        routes: [
          {
            distance: 4200,
            duration: 840,
            geometry: {
              coordinates: [
                [-3.7038, 40.4168],
                [-3.61, 40.51],
              ],
            },
          },
        ],
      }),
    } as Response)

    await expect(
      fetchProjectedRoute(
        { lat: 40.4168, lng: -3.7038 },
        { lat: 40.51, lng: -3.61 },
      ),
    ).resolves.toEqual({
      coordinates: [
        [40.4168, -3.7038],
        [40.51, -3.61],
      ],
      distanceKm: 4.2,
      etaMinutes: 14,
    })

    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 503,
    } as Response)

    await expect(
      fetchProjectedRoute(
        { lat: 40.4168, lng: -3.7038 },
        { lat: 40.51, lng: -3.61 },
      ),
    ).resolves.toBeNull()

    fetchSpy.mockRestore()
  })

  it("keeps runner operational labels consistent", () => {
    expect(deliveryStatusLabel("IN_TRANSIT")).toBe("En reparto")
    expect(deliveryStatusLabel("UNKNOWN")).toBe("Sin estado")
    expect(runnerPaymentLabel("PAYMENT_PENDING")).toBe("Pago pendiente")
    expect(runnerPaymentLabel("UNKNOWN")).toBe("Sin estado")
    expect(pickupStatusLabel("READY_FOR_PICKUP")).toBe("Listo para recoger")
    expect(incidentStatusLabel("RESOLVED")).toBe("Resuelta")
    expect(refundStatusLabel("FAILED")).toBe("Fallida")
    expect(shouldShowRouteMap("IN_TRANSIT")).toBe(true)
    expect(shouldShowRouteMap("CANCELLED")).toBe(false)
  })

  it("builds delivery milestones from operational states", () => {
    expect(
      buildDeliveryMilestones({
        orderStatus: "CONFIRMED",
        deliveryStatus: "PICKUP_PENDING",
        stopCount: 2,
      }).map((milestone) => milestone.state),
    ).toEqual(["done", "current", "upcoming", "upcoming"])

    expect(
      buildDeliveryMilestones({
        orderStatus: "DELIVERED",
        deliveryStatus: "DELIVERED",
        stopCount: 1,
      }).map((milestone) => milestone.state),
    ).toEqual(["done", "done", "done", "done"])

    expect(
      buildDeliveryMilestones({
        orderStatus: "CONFIRMED",
        deliveryStatus: "RUNNER_ASSIGNED",
        stopCount: 1,
      })[1]?.description,
    ).toContain("runner asignado")

    expect(
      buildDeliveryMilestones({
        orderStatus: "IN_TRANSIT",
        deliveryStatus: "PICKED_UP",
        stopCount: 1,
      })[2]?.description,
    ).toContain("ya está recogido")
  })

  it("summarizes operational health from tracking snapshot data", () => {
    const nowMs = new Date("2026-03-28T21:00:00.000Z").getTime()

    expect(getTrackingSignalState("2026-03-28T20:55:00.000Z", nowMs)).toBe("recent")
    expect(getTrackingSignalState("2026-03-28T20:40:00.000Z", nowMs)).toBe("stale")
    expect(getTrackingSignalState(null, nowMs)).toBe("missing")

    expect(getTrackingSignalLabel("2026-03-28T20:55:00.000Z", nowMs)).toBe("Señal reciente")
    expect(getPickupCoverageLabel("PICKUP_PENDING", 2)).toBe("Recogidas coordinándose")
    expect(getPickupCoverageLabel("PICKED_UP", 1)).toBe("Recogida completada")
    expect(
      getRunnerAssignmentLabel({
        orderId: "ord-1",
        status: "CONFIRMED",
        deliveryStatus: "RUNNER_ASSIGNED",
        runner: { id: "runner-1", name: "Runner Uno" },
        location: null,
        updatedAt: null,
      }),
    ).toBe("Asignado a Runner Uno")
  })
})
