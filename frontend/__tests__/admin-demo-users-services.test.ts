import { beforeEach, describe, expect, it, vi } from "vitest"

const getMock = vi.fn()
const postMock = vi.fn()
const patchMock = vi.fn()
const deleteMock = vi.fn()

vi.mock("@/lib/api", () => ({
  api: {
    get: (...args: unknown[]) => getMock(...args),
    post: (...args: unknown[]) => postMock(...args),
    patch: (...args: unknown[]) => patchMock(...args),
    delete: (...args: unknown[]) => deleteMock(...args),
  },
}))

describe("admin, users and demo services", () => {
  beforeEach(() => {
    getMock.mockReset()
    postMock.mockReset()
    patchMock.mockReset()
    deleteMock.mockReset()
  })

  it("hits every admin endpoint with the expected route and payload", async () => {
    const { adminService } = await import("@/lib/services/admin-service")

    await adminService.getMetrics()
    await adminService.getUsers()
    await adminService.updateUserRole("user-1", "ADMIN")
    await adminService.activateUser("user-1")
    await adminService.blockUser("user-1")
    await adminService.getCities()
    await adminService.createCity({ name: "Toledo", slug: "toledo", active: true })
    await adminService.updateCity("city-1", { name: "Madrid", slug: "madrid", active: false })
    await adminService.deleteCity("city-1")
    await adminService.getCategories()
    await adminService.createCategory({
      name: "Cerámica",
      slug: "ceramica",
      image_url: "/ceramica.jpg",
    })
    await adminService.updateCategory("cat-1", {
      name: "Textil",
      slug: "textil",
      image_url: "/textil.jpg",
    })
    await adminService.deleteCategory("cat-1")

    expect(getMock).toHaveBeenCalledWith("/admin/metrics")
    expect(getMock).toHaveBeenCalledWith("/admin/users")
    expect(patchMock).toHaveBeenCalledWith("/admin/users/user-1/role", { role: "ADMIN" })
    expect(patchMock).toHaveBeenCalledWith("/admin/users/user-1/activate")
    expect(patchMock).toHaveBeenCalledWith("/admin/users/user-1/block")
    expect(getMock).toHaveBeenCalledWith("/admin/cities")
    expect(postMock).toHaveBeenCalledWith("/admin/cities", {
      name: "Toledo",
      slug: "toledo",
      active: true,
    })
    expect(patchMock).toHaveBeenCalledWith("/admin/cities/city-1", {
      name: "Madrid",
      slug: "madrid",
      active: false,
    })
    expect(deleteMock).toHaveBeenCalledWith("/admin/cities/city-1")
    expect(getMock).toHaveBeenCalledWith("/admin/categories")
    expect(postMock).toHaveBeenCalledWith("/admin/categories", {
      name: "Cerámica",
      slug: "ceramica",
      image_url: "/ceramica.jpg",
    })
    expect(patchMock).toHaveBeenCalledWith("/admin/categories/cat-1", {
      name: "Textil",
      slug: "textil",
      image_url: "/textil.jpg",
    })
    expect(deleteMock).toHaveBeenCalledWith("/admin/categories/cat-1")
  })

  it("calls the role request and demo payment endpoints", async () => {
    const { usersService } = await import("@/lib/services/users-service")
    const { demoService } = await import("@/lib/services/demo-service")

    await usersService.requestRole({
      role: "PROVIDER",
      country: "ES",
      fiscalId: "12345678Z",
    })
    await demoService.confirmProviderOrderPayment("po-1")
    await demoService.confirmRunnerPayment("delivery-1")

    expect(postMock).toHaveBeenCalledWith("/users/request-role", {
      role: "PROVIDER",
      country: "ES",
      fiscalId: "12345678Z",
    })
    expect(postMock).toHaveBeenCalledWith("/demo/payments/provider-order/po-1/confirm")
    expect(postMock).toHaveBeenCalledWith("/demo/payments/delivery-order/delivery-1/confirm")
  })
})
