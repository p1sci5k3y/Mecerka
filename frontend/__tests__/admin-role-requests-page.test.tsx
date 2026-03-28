import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

const getUsersMock = vi.fn()
const toastMock = vi.fn()

vi.mock("@/lib/services/admin-service", () => ({
  adminService: {
    getUsers: (...args: unknown[]) => getUsersMock(...args),
  },
}))

vi.mock("@/lib/navigation", () => ({
  Link: ({ href, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({
    toast: (...args: unknown[]) => toastMock(...args),
  }),
}))

describe("Admin role requests page", () => {
  beforeEach(() => {
    getUsersMock.mockReset()
    toastMock.mockReset()
  })

  it("shows governance summaries and filters pending requests", async () => {
    getUsersMock.mockResolvedValue([
      {
        id: "user-1",
        name: "Lola Solicita",
        email: "lola@example.com",
        roles: ["CLIENT"],
        active: true,
        mfaEnabled: false,
        createdAt: "2026-03-20T10:00:00.000Z",
        requestedRole: "PROVIDER",
        roleStatus: "PENDING",
        requestedAt: "2026-03-21T10:00:00.000Z",
        lastRoleSource: null,
      },
      {
        id: "user-2",
        name: "Diego Aprobado",
        email: "diego@example.com",
        roles: ["CLIENT", "RUNNER"],
        active: true,
        mfaEnabled: true,
        createdAt: "2026-03-20T10:00:00.000Z",
        requestedRole: "RUNNER",
        roleStatus: "APPROVED",
        requestedAt: "2026-03-21T10:00:00.000Z",
        lastRoleSource: "SELF_SERVICE",
      },
    ])

    const Page = (await import("@/app/[locale]/admin/role-requests/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText(/solicitudes y concesiones/i)).toBeInTheDocument()
    })

    expect(screen.getAllByText("1")).toHaveLength(2)
    expect(screen.getByText(/concedidas por autoservicio/i)).toBeInTheDocument()
    expect(screen.getByText(/lola@example.com/i)).toBeInTheDocument()
    expect(screen.getByText(/diego@example.com/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /pendientes/i }))

    expect(screen.getByText(/lola@example.com/i)).toBeInTheDocument()
    expect(screen.queryByText(/diego@example.com/i)).not.toBeInTheDocument()
  })

  it("shows an explicit error state when governance data cannot be loaded", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    getUsersMock.mockRejectedValue(new Error("offline"))

    const Page = (await import("@/app/[locale]/admin/role-requests/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        title: "Error",
        description: "No se pudo cargar la cola de gobierno.",
        variant: "destructive",
      })
    })
    expect(
      await screen.findByText(/La cola de gobierno no se pudo cargar correctamente/i),
    ).toBeInTheDocument()
    consoleErrorSpy.mockRestore()
  })

  it("shows the empty-state when the selected governance filter has no matches", async () => {
    getUsersMock.mockResolvedValue([
      {
        id: "user-2",
        name: "Diego Aprobado",
        email: "diego@example.com",
        roles: ["CLIENT", "RUNNER"],
        active: true,
        mfaEnabled: true,
        createdAt: "2026-03-20T10:00:00.000Z",
        requestedRole: "RUNNER",
        roleStatus: "APPROVED",
        requestedAt: "2026-03-21T10:00:00.000Z",
        lastRoleSource: "SELF_SERVICE",
      },
    ])

    const Page = (await import("@/app/[locale]/admin/role-requests/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText(/diego@example.com/i)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: "Admin" }))
    expect(screen.getByText(/No hay elementos en esta cola con el estado seleccionado/i)).toBeInTheDocument()
  })
})
