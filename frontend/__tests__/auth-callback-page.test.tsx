import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("@/lib/navigation", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    asChild,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) =>
    asChild ? <>{children}</> : <button {...rest}>{children}</button>,
}))

describe("CallbackPage", () => {
  it("shows the callback deprecation message and routes back to login", async () => {
    const { default: CallbackPage } = await import("@/app/[locale]/auth/callback/page")
    render(<CallbackPage />)

    expect(screen.getByText("Acceso por enlace no disponible")).toBeInTheDocument()
    expect(
      screen.getByText(/correo, contraseña y MFA/i),
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Ir a iniciar sesión" })).toHaveAttribute(
      "href",
      "/login",
    )
  })
})
