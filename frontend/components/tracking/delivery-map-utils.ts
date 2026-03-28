import { getRoutingBaseUrl } from "@/lib/runtime-config"

export type RouteProjection = {
  coordinates: [number, number][]
  distanceKm: number
  etaMinutes: number
}

export function calculateDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (value: number) => (value * Math.PI) / 180
  const earthRadiusKm = 6371
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return earthRadiusKm * c
}

export function formatDistanceLabel(distanceKm: number | null) {
  if (distanceKm == null) return "Sin estimación"
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m`
  return `${distanceKm.toFixed(1)} km`
}

export function formatEtaLabel(distanceKm: number | null) {
  if (distanceKm == null) return "Pendiente de GPS"
  const minutes = Math.max(3, Math.round((distanceKm / 18) * 60))
  return `${minutes} min aprox.`
}

export function formatLastUpdateLabel(updatedAt: string | null) {
  if (!updatedAt) return "Sin señal todavía"
  return new Date(updatedAt).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function runnerTrackingStatusLabel(status: string | null) {
  switch (status) {
    case "RUNNER_ASSIGNED":
      return "Esperando recogida operativa"
    case "PICKUP_PENDING":
      return "Ruta lista para recogida"
    case "PICKED_UP":
    case "IN_TRANSIT":
      return "Transmitiendo reparto en curso"
    case "DELIVERING":
      return "Ruta activa"
    case "DELIVERED":
      return "Ruta cerrada por entrega completada"
    case "CANCELLED":
      return "Ruta cerrada por cancelación"
    default:
      return "Esperando contexto operativo"
  }
}

export async function geocode(
  address: string,
  fallbackLat: number,
  fallbackLng: number,
): Promise<{ lat: number; lng: number }> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
    )
    const data = (await res.json()) as Array<{ lat: string; lon: string }>
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
    }
  } catch {
    console.error("Geocoding failed for", address)
  }
  return { lat: fallbackLat, lng: fallbackLng }
}

export async function fetchProjectedRoute(
  start: { lat: number; lng: number },
  end: { lat: number; lng: number },
): Promise<RouteProjection | null> {
  try {
    const routeUrl =
      `${getRoutingBaseUrl().replace(/\/$/, "")}/route/v1/driving/` +
      `${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`
    const res = await fetch(routeUrl)
    if (!res.ok) {
      throw new Error(`Route service unavailable (${res.status})`)
    }

    const data = (await res.json()) as {
      routes?: Array<{
        distance?: number
        duration?: number
        geometry?: {
          coordinates?: Array<[number, number]>
        }
      }>
    }

    const route = data.routes?.[0]
    const geometry = route?.geometry?.coordinates
    if (!route || !geometry || geometry.length === 0) {
      return null
    }

    return {
      coordinates: geometry.map(([lng, lat]) => [lat, lng]),
      distanceKm: (route.distance ?? 0) / 1000,
      etaMinutes: Math.max(1, Math.round((route.duration ?? 0) / 60)),
    }
  } catch (error) {
    console.error("Route projection failed", error)
    return null
  }
}
