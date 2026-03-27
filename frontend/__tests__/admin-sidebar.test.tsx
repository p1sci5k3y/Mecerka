import { describe, expect, it, vi, beforeEach } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

const logoutMock = vi.fn()
const usePathnameMock = vi.fn()

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({
    logout: logoutMock,
  }),
}))

vi.mock("@/lib/navigation", () => ({
  Link: ({ href, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  usePathname: () => usePathnameMock(),
}))

describe("AdminSidebar", () => {
  beforeEach(() => {
    logoutMock.mockReset()
    usePathnameMock.mockReset()
  })

  it("renders admin links, highlights the current section and logs out", async () => {
    usePathnameMock.mockReturnValue("/admin/users")
    const { AdminSidebar } = await import("@/components/admin-sidebar")

    render(<AdminSidebar />)

    expect(screen.getByRole("link", { name: /MecerkaAdmin/i })).toHaveAttribute("href", "/")
    expect(screen.getByRole("link", { name: /Usuarios/i })).toHaveAttribute("href", "/admin/users")
    expect(screen.getByRole("link", { name: /Ciudades/i })).toHaveAttribute(
      "href",
      "/admin/masters?tab=cities",
    )
    expect(screen.getByRole("link", { name: /Usuarios/i }).className).toContain("bg-primary/10")

    fireEvent.click(screen.getByRole("button", { name: /Cerrar sesión/i }))
    expect(logoutMock).toHaveBeenCalled()
  })
})
