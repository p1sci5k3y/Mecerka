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

  it("hits governance, city and category admin endpoints with the expected route and payload", async () => {
    const { adminService } = await import("@/lib/services/admin-service")

    await adminService.getMetrics()
    await adminService.getUsers()
    await adminService.getUser("user-1")
    await adminService.getUserGovernanceHistory("user-1")
    await adminService.grantRole("user-1", "ADMIN")
    await adminService.revokeRole("user-1", "ADMIN")
    await adminService.grantProvider("user-1")
    await adminService.grantRunner("user-1")
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
    expect(getMock).toHaveBeenCalledWith("/admin/users/user-1")
    expect(getMock).toHaveBeenCalledWith("/admin/users/user-1/governance-history")
    expect(postMock).toHaveBeenCalledWith("/admin/users/user-1/grant", { role: "ADMIN" })
    expect(postMock).toHaveBeenCalledWith("/admin/users/user-1/revoke", { role: "ADMIN" })
    expect(postMock).toHaveBeenCalledWith("/admin/users/user-1/grant/provider")
    expect(postMock).toHaveBeenCalledWith("/admin/users/user-1/grant/runner")
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

  it("loads refund and incident lists, resolves entries by id and errors when they do not exist", async () => {
    const { adminService } = await import("@/lib/services/admin-service")

    const refunds = [
      {
        id: "refund-1",
        orderId: "order-1",
        providerOrderId: "provider-order-1",
        deliveryOrderId: null,
        incidentId: null,
        type: "PROVIDER_PARTIAL",
        status: "UNDER_REVIEW",
        amount: 9.5,
        currency: "EUR",
        requestedById: "client-1",
        reviewedById: null,
        createdAt: "2026-03-28T08:00:00.000Z",
        reviewedAt: null,
        completedAt: null,
      },
    ]
    const incidents = [
      {
        id: "incident-1",
        orderId: "order-1",
        deliveryOrderId: "delivery-1",
        reporterRole: "CLIENT",
        type: "MISSING_ITEMS",
        status: "OPEN",
        description: "Falta un artículo",
        evidenceUrl: null,
        createdAt: "2026-03-28T08:05:00.000Z",
        resolvedAt: null,
      },
    ]

    getMock
      .mockResolvedValueOnce(refunds)
      .mockResolvedValueOnce(refunds)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(incidents)
      .mockResolvedValueOnce(incidents)
      .mockResolvedValueOnce([])

    await expect(adminService.getRefunds()).resolves.toEqual(refunds)
    await expect(adminService.getRefund("refund-1")).resolves.toEqual(refunds[0])
    await expect(adminService.getRefund("missing-refund")).rejects.toThrow(
      "Refund not found",
    )
    await expect(adminService.getIncidents()).resolves.toEqual(incidents)
    await expect(adminService.getIncident("incident-1")).resolves.toEqual(incidents[0])
    await expect(adminService.getIncident("missing-incident")).rejects.toThrow(
      "Incident not found",
    )

    expect(getMock).toHaveBeenCalledWith("/admin/refunds")
    expect(getMock).toHaveBeenCalledWith("/admin/incidents")
  })

  it("calls refund, incident and SMTP admin actions with the expected payloads", async () => {
    const { adminService } = await import("@/lib/services/admin-service")

    await adminService.reviewRefund("refund-1")
    await adminService.approveRefund("refund-1")
    await adminService.rejectRefund("refund-1")
    await adminService.executeRefund("refund-1")
    await adminService.reviewIncident("incident-1")
    await adminService.resolveIncident("incident-1")
    await adminService.rejectIncident("incident-1")
    await adminService.getEmailSettings()
    await adminService.updateEmailSettings({
      connectorType: "SMTP",
      host: "email-smtp.eu-west-1.amazonaws.com",
      port: 587,
      user: "smtp-user",
      password: "smtp-pass",
      from: "support@mecerka.me",
    })
    await adminService.sendEmailSettingsTest("ops@mecerka.me")

    expect(patchMock).toHaveBeenCalledWith("/refunds/refund-1/review")
    expect(patchMock).toHaveBeenCalledWith("/refunds/refund-1/approve")
    expect(patchMock).toHaveBeenCalledWith("/refunds/refund-1/reject")
    expect(postMock).toHaveBeenCalledWith("/refunds/refund-1/execute")
    expect(patchMock).toHaveBeenCalledWith("/delivery/incidents/incident-1/review")
    expect(patchMock).toHaveBeenCalledWith("/delivery/incidents/incident-1/resolve")
    expect(patchMock).toHaveBeenCalledWith("/delivery/incidents/incident-1/reject")
    expect(getMock).toHaveBeenCalledWith("/admin/email-settings")
    expect(patchMock).toHaveBeenCalledWith("/admin/email-settings", {
      connectorType: "SMTP",
      host: "email-smtp.eu-west-1.amazonaws.com",
      port: 587,
      user: "smtp-user",
      password: "smtp-pass",
      from: "support@mecerka.me",
    })
    expect(postMock).toHaveBeenCalledWith("/admin/email-settings/test", {
      recipient: "ops@mecerka.me",
    })
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
