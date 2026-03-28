import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react"

const socketHandlers = new Map<string, (...args: unknown[]) => void>()
const socketEmit = vi.fn()
const socketDisconnect = vi.fn()
const getOneMock = vi.fn()
const getTrackingMock = vi.fn()
const watchPositionMock = vi.fn()
const clearWatchMock = vi.fn()

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="map-container">{children}</div>
  ),
  TileLayer: () => <div data-testid="tile-layer" />,
  Marker: ({ children }: { children: React.ReactNode }) => <div data-testid="marker">{children}</div>,
  Popup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Polyline: ({ positions }: { positions: unknown }) => (
    <div data-testid="polyline">{JSON.stringify(positions)}</div>
  ),
  useMap: () => ({
    flyTo: vi.fn(),
  }),
}))

vi.mock("leaflet", () => {
  function MockIcon(this: { options?: unknown }, options?: unknown) {
    this.options = options
  }

  const DefaultIcon = function DefaultIcon() {}
  ;(DefaultIcon as unknown as { prototype: Record<string, unknown> }).prototype = {}
  ;(DefaultIcon as unknown as { mergeOptions: ReturnType<typeof vi.fn> }).mergeOptions = vi.fn()

  return {
    default: {
      Icon: Object.assign(MockIcon, { Default: DefaultIcon }),
    },
    Icon: Object.assign(MockIcon, { Default: DefaultIcon }),
  }
})

vi.mock("socket.io-client", () => ({
  default: vi.fn(() => ({
    on: (event: string, handler: (...args: unknown[]) => void) => {
      socketHandlers.set(event, handler)
    },
    emit: socketEmit,
    disconnect: socketDisconnect,
  })),
}))

vi.mock("@/lib/services/orders-service", () => ({
  ordersService: {
    getOne: (...args: unknown[]) => getOneMock(...args),
    getTracking: (...args: unknown[]) => getTrackingMock(...args),
  },
}))

vi.mock("@/lib/runtime-config", () => ({
  getTrackingBaseUrl: () => "https://demo.mecerka.me",
}))

describe("DeliveryMap", () => {
  beforeEach(() => {
    socketHandlers.clear()
    socketEmit.mockReset()
    socketDisconnect.mockReset()
    getTrackingMock.mockReset()
    getOneMock.mockResolvedValue({
      id: "123",
      city: "Madrid",
      deliveryAddress: "Calle Mayor 1",
      items: [
        {
          product: {
            city: "Sevilla",
            providerId: "provider-1",
          },
        },
      ],
    })
    getTrackingMock.mockResolvedValue({
      orderId: "123",
      status: "ASSIGNED",
      deliveryStatus: "PICKUP_PENDING",
      runner: { id: "runner-1", name: "Runner Uno" },
      location: null,
      updatedAt: null,
    })

    global.fetch = vi.fn().mockResolvedValue({
      json: async () => [{ lat: "40.4168", lon: "-3.7038" }],
    }) as unknown as typeof fetch

    Object.defineProperty(globalThis.navigator, "geolocation", {
      configurable: true,
      value: {
        watchPosition: watchPositionMock,
        clearWatch: clearWatchMock,
      },
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("loads origin and destination and joins the tracking room", async () => {
    const DeliveryMap = (await import("@/components/tracking/DeliveryMap")).default
    render(<DeliveryMap orderId={123} initialLat={40.4} initialLng={-3.7} isRunner={false} />)

    await waitFor(() => {
      expect(getOneMock).toHaveBeenCalledWith(123)
    })
    expect(getTrackingMock).toHaveBeenCalledWith(123)

    await waitFor(() => {
      expect(screen.getByText(/Origen \(Taller de provider-1\)/)).toBeInTheDocument()
    })

    socketHandlers.get("connect")?.()

    expect(socketEmit).toHaveBeenCalledWith("joinOrder", { orderId: 123 })
    expect(screen.getByText(/Destino \(Calle Mayor 1\)/)).toBeInTheDocument()
    expect(screen.getByText("Runner Uno")).toBeInTheDocument()
    expect(screen.getByText(/ETA orientativa/i)).toBeInTheDocument()
  })

  it("lets the runner start GPS tracking and emits live location updates", async () => {
    let successHandler: ((position: GeolocationPosition) => void) | undefined
    watchPositionMock.mockImplementation((success: (position: GeolocationPosition) => void) => {
      successHandler = success
      return 77
    })

    const DeliveryMap = (await import("@/components/tracking/DeliveryMap")).default
    render(<DeliveryMap orderId={456} initialLat={40.4} initialLng={-3.7} isRunner />)

    const startButton = await screen.findByRole("button", { name: /Iniciar Ruta/i })
    fireEvent.click(startButton)

    expect(watchPositionMock).toHaveBeenCalled()

    successHandler?.({
      coords: {
        latitude: 40.42,
        longitude: -3.69,
      },
    } as GeolocationPosition)

    expect(socketEmit).toHaveBeenCalledWith("updateLocation", {
      orderId: 456,
      lat: 40.42,
      lng: -3.69,
    })

    await waitFor(() => {
      expect(screen.getByText(/Posición Actual del Repartidor/i)).toBeInTheDocument()
    })
  })

  it("shows customer-safe remote tracking when a location update arrives", async () => {
    const DeliveryMap = (await import("@/components/tracking/DeliveryMap")).default
    render(<DeliveryMap orderId={999} initialLat={40.4} initialLng={-3.7} isRunner={false} />)

    await waitFor(() => {
      expect(getOneMock).toHaveBeenCalledWith(999)
    })

    await act(async () => {
      socketHandlers.get("locationUpdated")?.({ lat: 40.5, lng: -3.6 })
    })

    await waitFor(() => {
      expect(screen.getByText(/Posición Actual del Repartidor/i)).toBeInTheDocument()
    })

    expect(screen.getAllByTestId("polyline").length).toBeGreaterThan(0)
  })

  it("seeds the route from the tracking snapshot before live socket updates", async () => {
    getTrackingMock.mockResolvedValueOnce({
      orderId: "555",
      status: "DELIVERING",
      deliveryStatus: "IN_TRANSIT",
      runner: { id: "runner-1", name: "Runner Uno" },
      location: { lat: 40.51, lng: -3.61 },
      updatedAt: "2026-03-28T10:00:00.000Z",
    })

    const DeliveryMap = (await import("@/components/tracking/DeliveryMap")).default
    render(<DeliveryMap orderId={555} initialLat={40.4} initialLng={-3.7} isRunner={false} />)

    await waitFor(() => {
      expect(screen.getByText(/Posición Actual del Repartidor/i)).toBeInTheDocument()
    })

    expect(screen.getByText("Runner Uno")).toBeInTheDocument()
    expect(screen.getByText(/^\d{2}:\d{2}$/)).toBeInTheDocument()
  })

  it("keeps the runner GPS action disabled once the route is already closed", async () => {
    getTrackingMock.mockResolvedValueOnce({
      orderId: "777",
      status: "DELIVERED",
      deliveryStatus: "DELIVERED",
      runner: { id: "runner-1", name: "Runner Uno" },
      location: { lat: 40.51, lng: -3.61 },
      updatedAt: "2026-03-28T10:00:00.000Z",
    })

    const DeliveryMap = (await import("@/components/tracking/DeliveryMap")).default
    render(<DeliveryMap orderId={777} initialLat={40.4} initialLng={-3.7} isRunner />)

    const closedButton = await screen.findByRole("button", { name: /Ruta cerrada/i })
    expect(closedButton).toBeDisabled()
  })
})
