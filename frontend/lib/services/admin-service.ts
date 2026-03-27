import { api } from "@/lib/api"
import type {
    AdminIncidentSummary,
    AdminGovernanceAuditEntry,
    AdminRefundSummary,
    AdminMetrics,
    BackendAdminUser,
    BackendAdminUserDetail,
    BackendCity,
    BackendCategory,
    Role,
    CreateCityDto,
    UpdateCityDto,
    CreateCategoryDto,
    UpdateCategoryDto
} from "@/lib/types"

export const adminService = {
    // Metrics
    getMetrics: async () => {
        return api.get<AdminMetrics>("/admin/metrics")
    },

    // Users
    getUsers: async () => {
        return api.get<BackendAdminUser[]>("/admin/users")
    },

    getUser: async (id: string) => {
        return api.get<BackendAdminUserDetail>(`/admin/users/${id}`)
    },

    getUserGovernanceHistory: async (id: string) => {
        return api.get<AdminGovernanceAuditEntry[]>(`/admin/users/${id}/governance-history`)
    },

    grantRole: async (id: string, role: Role) => {
        return api.post<BackendAdminUser>(`/admin/users/${id}/grant`, { role })
    },

    revokeRole: async (id: string, role: Role) => {
        return api.post<BackendAdminUser>(`/admin/users/${id}/revoke`, { role })
    },

    grantProvider: async (id: string) => {
        return api.post<BackendAdminUser>(`/admin/users/${id}/grant/provider`)
    },

    grantRunner: async (id: string) => {
        return api.post<BackendAdminUser>(`/admin/users/${id}/grant/runner`)
    },

    activateUser: async (id: string) => {
        return api.patch<BackendAdminUser>(`/admin/users/${id}/activate`)
    },

    blockUser: async (id: string) => {
        return api.patch<BackendAdminUser>(`/admin/users/${id}/block`)
    },

    // Cities
    getCities: async () => {
        return api.get<BackendCity[]>("/admin/cities")
    },

    createCity: async (data: CreateCityDto) => {
        return api.post<BackendCity>("/admin/cities", data)
    },

    updateCity: async (id: string, data: UpdateCityDto) => {
        return api.patch<BackendCity>(`/admin/cities/${id}`, data)
    },

    deleteCity: async (id: string) => {
        return api.delete(`/admin/cities/${id}`)
    },

    // Categories
    getCategories: async () => {
        return api.get<BackendCategory[]>("/admin/categories")
    },

    createCategory: async (data: CreateCategoryDto) => {
        return api.post<BackendCategory>("/admin/categories", data)
    },

    updateCategory: async (id: string, data: UpdateCategoryDto) => {
        return api.patch<BackendCategory>(`/admin/categories/${id}`, data)
    },

    deleteCategory: async (id: string) => {
        return api.delete(`/admin/categories/${id}`)
    },

    // Refunds
    getRefunds: async () => {
        return api.get<AdminRefundSummary[]>("/admin/refunds")
    },

    getRefund: async (id: string) => {
        const refunds = await api.get<AdminRefundSummary[]>("/admin/refunds")
        const refund = refunds.find((entry) => entry.id === id)
        if (!refund) {
            throw new Error("Refund not found")
        }
        return refund
    },

    reviewRefund: async (id: string) => {
        return api.patch<AdminRefundSummary>(`/refunds/${id}/review`)
    },

    approveRefund: async (id: string) => {
        return api.patch<AdminRefundSummary>(`/refunds/${id}/approve`)
    },

    rejectRefund: async (id: string) => {
        return api.patch<AdminRefundSummary>(`/refunds/${id}/reject`)
    },

    executeRefund: async (id: string) => {
        return api.post<AdminRefundSummary>(`/refunds/${id}/execute`)
    },

    // Incidents
    getIncidents: async () => {
        return api.get<AdminIncidentSummary[]>("/admin/incidents")
    },

    getIncident: async (id: string) => {
        const incidents = await api.get<AdminIncidentSummary[]>("/admin/incidents")
        const incident = incidents.find((entry) => entry.id === id)
        if (!incident) {
            throw new Error("Incident not found")
        }
        return incident
    },

    reviewIncident: async (id: string) => {
        return api.patch<AdminIncidentSummary>(`/delivery/incidents/${id}/review`)
    },

    resolveIncident: async (id: string) => {
        return api.patch<AdminIncidentSummary>(`/delivery/incidents/${id}/resolve`)
    },

    rejectIncident: async (id: string) => {
        return api.patch<AdminIncidentSummary>(`/delivery/incidents/${id}/reject`)
    },
}
