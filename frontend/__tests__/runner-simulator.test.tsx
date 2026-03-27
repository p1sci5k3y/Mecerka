import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"

const socketHandlers = new Map<string, (...args: unknown[]) => void>()
const socketEmit = vi.fn()
const socketDisconnect = vi.fn()

vi.mock("socket.io-client", () => ({
  default: vi.fn(() => ({
    on: (event: string, handler: (...args: unknown[]) => void) => {
      socketHandlers.set(event, handler)
    },
    emit: socketEmit,
    disconnect: socketDisconnect,
  })),
}))

vi.mock("@/lib/runtime-config", () => ({
  getTrackingBaseUrl: () => "https://demo.mecerka.me",
}))

describe("RunnerSimulator", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(Math, "random").mockReturnValue(0.5)
    socketHandlers.clear()
    socketEmit.mockReset()
    socketDisconnect.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("joins the order room and emits simulated runner positions", async () => {
    const RunnerSimulator = (await import("@/components/tracking/RunnerSimulator")).default
    const { unmount } = render(<RunnerSimulator orderId={42} />)

    await act(async () => {
      socketHandlers.get("connect")?.()
    })
    expect(socketEmit).toHaveBeenCalledWith("joinOrder", { orderId: 42 })
    expect(screen.getByText(/Connected to Gateway/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /Start Delivery Simulation/i }))
    expect(screen.getByText(/Starting simulation/i)).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(100)
    })

    expect(socketEmit).toHaveBeenCalledWith("updateLocation", {
      orderId: 42,
      lat: 40.4155,
      lng: -3.7074,
    })

    await act(async () => {
      vi.advanceTimersByTime(10100)
    })

    expect(screen.getByText(/Simulation finished/i)).toBeInTheDocument()

    unmount()
    expect(socketDisconnect).toHaveBeenCalled()
  })
})
