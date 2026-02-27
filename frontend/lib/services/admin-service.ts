import { api } from "@/lib/api"
import type {
    AdminMetrics,
    BackendAdminUser,
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

    updateUserRole: async (id: number, role: Role) => {
        return api.patch<BackendAdminUser>(`/admin/users/${id}/role`, { role })
    },

    activateUser: async (id: number) => {
        return api.patch<BackendAdminUser>(`/admin/users/${id}/activate`)
    },

    blockUser: async (id: number) => {
        return api.patch<BackendAdminUser>(`/admin/users/${id}/block`)
    },

    // Cities
    getCities: async () => {
        return api.get<BackendCity[]>("/admin/cities")
    },

    createCity: async (data: CreateCityDto) => {
        return api.post<BackendCity>("/admin/cities", data)
    },

    updateCity: async (id: number, data: UpdateCityDto) => {
        return api.patch<BackendCity>(`/admin/cities/${id}`, data)
    },

    deleteCity: async (id: number) => {
        return api.delete(`/admin/cities/${id}`)
    },

    // Categories
    getCategories: async () => {
        return api.get<BackendCategory[]>("/admin/categories")
    },

    createCategory: async (data: CreateCategoryDto) => {
        return api.post<BackendCategory>("/admin/categories", data)
    },

    updateCategory: async (id: number, data: UpdateCategoryDto) => {
        return api.patch<BackendCategory>(`/admin/categories/${id}`, data)
    },

    deleteCategory: async (id: number) => {
        return api.delete(`/admin/categories/${id}`)
    },
}
