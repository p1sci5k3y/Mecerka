import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

const enableMock = vi.fn()
const verifyMock = vi.fn()
const disableMock = vi.fn()
const writeTextMock = vi.fn()
const toastSuccessMock = vi.fn()
const toastErrorMock = vi.fn()
const toastInfoMock = vi.fn()

vi.mock("@/lib/services/mfa-service", () => ({
  mfaService: {
    enable: (...args: unknown[]) => enableMock(...args),
    verify: (...args: unknown[]) => verifyMock(...args),
    disable: (...args: unknown[]) => disableMock(...args),
  },
}))

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
    info: (...args: unknown[]) => toastInfoMock(...args),
  },
}))

vi.mock("next/image", () => ({
  default: ({ alt, ...rest }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <img alt={alt} {...rest} />
  ),
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, asChild, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) =>
    asChild ? <>{children}</> : <button {...rest}>{children}</button>,
}))

vi.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))

describe("MfaSetup component", () => {
  beforeEach(() => {
    enableMock.mockReset()
    verifyMock.mockReset()
    disableMock.mockReset()
    writeTextMock.mockReset()
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
    toastInfoMock.mockReset()
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    })
  })

  it("enables MFA, copies the secret, verifies the code and allows disabling it", async () => {
    enableMock.mockResolvedValueOnce({
      qrCode: "data:image/png;base64,qr",
      secret: "SECRET123",
    })
    verifyMock.mockResolvedValueOnce({ success: true })
    disableMock.mockResolvedValueOnce({})

    const { MfaSetup } = await import("@/components/mfa-setup")
    render(<MfaSetup />)

    fireEvent.click(screen.getByRole("button", { name: /Activar MFA/i }))

    await waitFor(() => {
      expect(screen.getByAltText("Código QR para MFA")).toBeInTheDocument()
      expect(screen.getByText("SECRET123")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: /Copiar secreto/i }))
    expect(writeTextMock).toHaveBeenCalledWith("SECRET123")

    fireEvent.change(screen.getByPlaceholderText("Código de 6 dígitos"), {
      target: { value: "654321" },
    })
    fireEvent.click(screen.getByRole("button", { name: /Verificar/i }))

    await waitFor(() => {
      expect(verifyMock).toHaveBeenCalledWith("654321")
      expect(toastSuccessMock).toHaveBeenCalledWith("MFA activado correctamente")
      expect(screen.getByText("MFA activado")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: /Desactivar/i }))

    await waitFor(() => {
      expect(disableMock).toHaveBeenCalled()
      expect(toastInfoMock).toHaveBeenCalledWith("MFA desactivado (mock)")
      expect(screen.getByText("MFA desactivado")).toBeInTheDocument()
    })
  })

  it("rejects invalid codes and surfaces service failures", async () => {
    enableMock.mockRejectedValueOnce(new Error("smtp"))

    const { MfaSetup } = await import("@/components/mfa-setup")
    const { rerender } = render(<MfaSetup />)

    fireEvent.click(screen.getByRole("button", { name: /Activar MFA/i }))

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("Error al iniciar configuración MFA")
    })

    enableMock.mockResolvedValueOnce({
      qrCode: "data:image/png;base64,qr",
      secret: "SECRET123",
    })
    rerender(<MfaSetup />)
    fireEvent.click(screen.getByRole("button", { name: /Activar MFA/i }))

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Código de 6 dígitos")).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText("Código de 6 dígitos"), {
      target: { value: "12" },
    })
    fireEvent.click(screen.getByRole("button", { name: /Verificar/i }))
    expect(verifyMock).not.toHaveBeenCalled()
    expect(toastErrorMock).toHaveBeenCalledWith("El código debe tener 6 dígitos")

    verifyMock.mockRejectedValueOnce(new Error("bad-code"))
    fireEvent.change(screen.getByPlaceholderText("Código de 6 dígitos"), {
      target: { value: "123456" },
    })
    fireEvent.click(screen.getByRole("button", { name: /Verificar/i }))

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("Código inválido")
    })
  })
})
