import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

const getUserMock = vi.fn()
const getHistoryMock = vi.fn()
const blockUserMock = vi.fn()
const activateUserMock = vi.fn()
const grantRoleMock = vi.fn()
const revokeRoleMock = vi.fn()
const toastMock = vi.fn()

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "user-1" }),
}))

vi.mock("@/lib/navigation", () => ({
  Link: ({ children, href, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock("@/lib/services/admin-service", () => ({
  adminService: {
    getUser: (...args: unknown[]) => getUserMock(...args),
    getUserGovernanceHistory: (...args: unknown[]) => getHistoryMock(...args),
    blockUser: (...args: unknown[]) => blockUserMock(...args),
    activateUser: (...args: unknown[]) => activateUserMock(...args),
    grantRole: (...args: unknown[]) => grantRoleMock(...args),
    revokeRole: (...args: unknown[]) => revokeRoleMock(...args),
  },
}))

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({
    user: {
      userId: "admin-self",
      roles: ["ADMIN"],
      mfaEnabled: true,
      hasPin: false,
    },
  }),
}))

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({
    toast: (...args: unknown[]) => toastMock(...args),
  }),
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...rest}>{children}</button>,
}))

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

describe("Admin user detail page", () => {
  beforeEach(() => {
    getUserMock.mockReset()
    getHistoryMock.mockReset()
    blockUserMock.mockReset()
    activateUserMock.mockReset()
    grantRoleMock.mockReset()
    revokeRoleMock.mockReset()
    toastMock.mockReset()
  })

  it("renders user summary and governance timeline", async () => {
    getUserMock.mockResolvedValue({
      id: "user-1",
      email: "lucia@example.com",
      name: "Lucia Admin",
      roles: ["CLIENT", "RUNNER"],
      createdAt: "2026-03-20T10:00:00.000Z",
      mfaEnabled: true,
      active: true,
      requestedRole: "RUNNER",
      roleStatus: "APPROVED",
      requestedAt: "2026-03-21T10:00:00.000Z",
      lastRoleSource: "ADMIN",
      lastRoleGrantedById: "admin-1",
      lastRoleGrantedBy: {
        id: "admin-1",
        email: "admin@example.com",
        name: "Admin Demo",
      },
    })
    getHistoryMock.mockResolvedValue([
      {
        id: "audit-1",
        action: "ROLE_GRANTED",
        role: "RUNNER",
        source: "ADMIN",
        metadata: { note: "manual-review" },
        createdAt: "2026-03-21T10:10:00.000Z",
        actorId: "admin-1",
        actorEmail: "admin@example.com",
        actorName: "Admin Demo",
      },
    ])

    const Page = (await import("@/app/[locale]/admin/users/[id]/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("Lucia Admin")).toBeInTheDocument()
    })

    expect(screen.getByText("lucia@example.com")).toBeInTheDocument()
    expect(screen.getByText(/concedido por admin/i)).toBeInTheDocument()
    expect(screen.getByText(/rol runner concedido/i)).toBeInTheDocument()
    expect(screen.getByText(/manual-review/i)).toBeInTheDocument()
  })

  it("executes admin actions and reloads the user detail", async () => {
    const activeUser = {
      id: "user-1",
      email: "runner@example.com",
      name: "Runner Demo",
      roles: ["CLIENT"],
      createdAt: "2026-03-20T10:00:00.000Z",
      mfaEnabled: false,
      active: true,
      requestedRole: null,
      roleStatus: null,
      requestedAt: null,
      lastRoleSource: null,
      lastRoleGrantedById: null,
      lastRoleGrantedBy: null,
    }
    const blockedUser = { ...activeUser, active: false }
    const runnerUser = { ...blockedUser, roles: ["CLIENT", "RUNNER"], lastRoleSource: "ADMIN" }

    getUserMock.mockResolvedValue(activeUser)
    getHistoryMock.mockResolvedValue([])
    blockUserMock.mockImplementation(async () => {
      getUserMock.mockResolvedValue(blockedUser)
      return {}
    })
    grantRoleMock.mockImplementation(async () => {
      getUserMock.mockResolvedValue(runnerUser)
      return {}
    })

    const Page = (await import("@/app/[locale]/admin/users/[id]/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("Runner Demo")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: /bloquear usuario/i }))

    await waitFor(() => {
      expect(blockUserMock).toHaveBeenCalledWith("user-1")
      expect(toastMock).toHaveBeenCalledWith({ title: "Usuario bloqueado" })
    })

    fireEvent.click(screen.getByRole("button", { name: /conceder runner/i }))

    await waitFor(() => {
      expect(grantRoleMock).toHaveBeenCalledWith("user-1", "RUNNER")
      expect(toastMock).toHaveBeenCalledWith({ title: "Rol RUNNER concedido" })
    })
  })
})
