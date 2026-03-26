import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"

const mockUseParams = vi.fn()
const mockUseAuth = vi.fn()
const mapPropsSpy = vi.fn()

vi.mock("next/navigation", () => ({
  useParams: () => mockUseParams(),
}))

vi.mock("next/dynamic", () => ({
  default: (loader: unknown) => {
    void loader
    return (props: unknown) => {
      mapPropsSpy(props)
      return <div data-testid="dynamic-delivery-map" />
    }
  },
}))

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => mockUseAuth(),
}))

vi.mock("@/components/navbar", () => ({
  Navbar: () => <nav data-testid="navbar" />,
}))

vi.mock("@/components/protected-route", () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="protected-route">{children}</div>
  ),
}))

describe("TrackOrderPage", () => {
  beforeEach(() => {
    mapPropsSpy.mockReset()
    mockUseParams.mockReturnValue({ id: "577731b8-f2e9-4a16-8594-981b5dff09b2" })
  })

  it("passes runner mode when the authenticated user is a runner", async () => {
    mockUseAuth.mockReturnValue({
      user: { roles: ["RUNNER"] },
    })

    const TrackOrderPage = (await import("@/app/[locale]/orders/[id]/track/page")).default
    render(<TrackOrderPage />)

    expect(
      screen.getByText(
        "Seguimiento del Pedido #577731b8-f2e9-4a16-8594-981b5dff09b2",
      ),
    ).toBeInTheDocument()
    expect(screen.getByTestId("dynamic-delivery-map")).toBeInTheDocument()
    expect(mapPropsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "577731b8-f2e9-4a16-8594-981b5dff09b2",
        isRunner: true,
        initialLat: 40.4168,
        initialLng: -3.7038,
      }),
    )
  })

  it("keeps client tracking in read-only mode", async () => {
    mockUseAuth.mockReturnValue({
      user: { roles: ["CLIENT"] },
    })

    const TrackOrderPage = (await import("@/app/[locale]/orders/[id]/track/page")).default
    render(<TrackOrderPage />)

    expect(mapPropsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "577731b8-f2e9-4a16-8594-981b5dff09b2",
        isRunner: false,
      }),
    )
  })
})
