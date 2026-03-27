import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

const getUsersMock = vi.fn()
const blockUserMock = vi.fn()
const activateUserMock = vi.fn()
const grantRoleMock = vi.fn()
const revokeRoleMock = vi.fn()
const toastMock = vi.fn()
const writeTextMock = vi.fn()

vi.mock("@/lib/services/admin-service", () => ({
  adminService: {
    getUsers: (...args: unknown[]) => getUsersMock(...args),
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
  Button: ({ children, asChild, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) =>
    asChild ? <>{children}</> : <button {...rest}>{children}</button>,
}))

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuItem: ({
    children,
    onClick,
    className,
    disabled,
  }: {
    children: React.ReactNode
    onClick?: () => void
    className?: string
    disabled?: boolean
  }) => (
    <button type="button" onClick={onClick} className={className} disabled={disabled}>
      {children}
    </button>
  ),
}))

vi.mock("@/components/ui/table", () => ({
  Table: ({ children }: { children: React.ReactNode }) => <table>{children}</table>,
  TableHeader: ({ children }: { children: React.ReactNode }) => <thead>{children}</thead>,
  TableBody: ({ children }: { children: React.ReactNode }) => <tbody>{children}</tbody>,
  TableRow: ({ children }: { children: React.ReactNode }) => <tr>{children}</tr>,
  TableHead: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <th className={className}>{children}</th>
  ),
  TableCell: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <td className={className}>{children}</td>
  ),
}))

describe("Admin users page", () => {
  beforeEach(() => {
    getUsersMock.mockReset()
    blockUserMock.mockReset()
    activateUserMock.mockReset()
    grantRoleMock.mockReset()
    revokeRoleMock.mockReset()
    toastMock.mockReset()
    writeTextMock.mockReset()
    getUsersMock.mockResolvedValue([])
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    })
  })

  it("loads users, shows governance metadata, copies the email and blocks an active account", async () => {
    const activeUser = {
      id: "user-1",
      name: "Lucia Admin",
      email: "lucia@example.com",
      roles: ["CLIENT", "ADMIN"],
      active: true,
      mfaEnabled: true,
      createdAt: "2026-03-20T10:00:00.000Z",
      requestedRole: "RUNNER",
      roleStatus: "PENDING",
      requestedAt: "2026-03-21T10:00:00.000Z",
      lastRoleSource: "USER_REQUEST",
    }
    const blockedUser = { ...activeUser, active: false }

    getUsersMock.mockImplementation(() => Promise.resolve([activeUser]))
    blockUserMock.mockImplementation(async () => {
      getUsersMock.mockImplementation(() => Promise.resolve([blockedUser]))
      return {}
    })

    const Page = (await import("@/app/[locale]/admin/users/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText("Gestión de Usuarios")).toBeInTheDocument()
    })

    expect(screen.getByText(/solicitud runner pendiente/i)).toBeInTheDocument()
    expect(screen.getByText(/originado por solicitud/i)).toBeInTheDocument()
    expect(screen.getByText(/mfa activado/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /Copiar Email/i }))
    expect(writeTextMock).toHaveBeenCalledWith("lucia@example.com")

    fireEvent.click(
      screen
        .getAllByRole("button")
        .find((button) => button.textContent?.includes("Bloquear")) as HTMLButtonElement,
    )

    await waitFor(() => {
      expect(blockUserMock).toHaveBeenCalledWith("user-1")
      expect(screen.getByText(/lucia@example.com/i)).toBeInTheDocument()
    })

    expect(toastMock).toHaveBeenCalledWith({ title: "Usuario bloqueado" })
  })

  it("activates a blocked account and surfaces the destructive load error", async () => {
    const blockedUser = {
      id: "user-2",
      name: "Pablo Taller",
      email: "pablo@example.com",
      roles: ["PROVIDER"],
      active: false,
      mfaEnabled: false,
      createdAt: "2026-03-20T10:00:00.000Z",
      requestedRole: null,
      roleStatus: null,
      requestedAt: null,
      lastRoleSource: null,
    }
    const activeUser = { ...blockedUser, active: true }

    getUsersMock.mockRejectedValueOnce(new Error("offline"))
    activateUserMock.mockImplementation(async () => {
      getUsersMock.mockImplementation(() => Promise.resolve([activeUser]))
      return {}
    })

    const Page = (await import("@/app/[locale]/admin/users/page")).default
    const { unmount } = render(<Page />)

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        title: "Error",
        description: "No se pudieron cargar los usuarios",
        variant: "destructive",
      })
    })

    unmount()
    getUsersMock.mockImplementation(() => Promise.resolve([blockedUser]))
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText(/pablo@example.com/i)).toBeInTheDocument()
    })

    fireEvent.click(
      screen
        .getAllByRole("button")
        .find((button) => button.textContent?.includes("Activar")) as HTMLButtonElement,
    )

    await waitFor(() => {
      expect(activateUserMock).toHaveBeenCalledWith("user-2")
      expect(toastMock).toHaveBeenCalledWith({ title: "Usuario activado" })
      expect(screen.getByText(/pablo@example.com/i)).toBeInTheDocument()
    })
  })

  it("grants a requested role and revokes an existing role", async () => {
    const candidate = {
      id: "user-3",
      name: "Marta Solicita",
      email: "marta@example.com",
      roles: ["CLIENT", "PROVIDER"],
      active: true,
      mfaEnabled: true,
      createdAt: "2026-03-20T10:00:00.000Z",
      requestedRole: "RUNNER",
      roleStatus: "PENDING",
      requestedAt: "2026-03-21T10:00:00.000Z",
      lastRoleSource: "USER_REQUEST",
    }
    const afterGrant = { ...candidate, roles: ["CLIENT", "PROVIDER", "RUNNER"], roleStatus: "APPROVED" }
    const afterRevoke = { ...afterGrant, roles: ["CLIENT", "RUNNER"] }

    getUsersMock.mockImplementation(() => Promise.resolve([candidate]))
    grantRoleMock.mockImplementation(async () => {
      getUsersMock.mockImplementation(() => Promise.resolve([afterGrant]))
      return {}
    })
    revokeRoleMock.mockImplementation(async () => {
      getUsersMock.mockImplementation(() => Promise.resolve([afterRevoke]))
      return {}
    })

    const Page = (await import("@/app/[locale]/admin/users/page")).default
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText(/marta@example.com/i)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: /aprobar solicitud runner/i }))

    await waitFor(() => {
      expect(grantRoleMock).toHaveBeenCalledWith("user-3", "RUNNER")
      expect(toastMock).toHaveBeenCalledWith({ title: "Rol RUNNER concedido" })
    })

    fireEvent.click(screen.getByRole("button", { name: /revocar provider/i }))

    await waitFor(() => {
      expect(revokeRoleMock).toHaveBeenCalledWith("user-3", "PROVIDER")
      expect(toastMock).toHaveBeenCalledWith({ title: "Rol PROVIDER revocado" })
    })
  })
})
