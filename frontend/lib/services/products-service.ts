import { api } from "@/lib/api"
import type { Product, BackendProduct, CreateProductDto, UpdateProductDto } from "@/lib/types"

function transformProduct(bp: BackendProduct): Product {
  return {
    id: String(bp.id),
    name: bp.name,
    description: bp.description || "",
    price: Number.parseFloat(bp.price),
    stock: bp.stock,
    city: bp.city?.name || "Desconocida",
    category: bp.category?.name || "General",
    imageUrl: bp.imageUrl,
    providerId: String(bp.providerId),
    provider: bp.provider ? { name: bp.provider.name } : undefined,
    createdAt: bp.createdAt,
    updatedAt: bp.updatedAt
  }
}

export const productsService = {
  getAll: async () => {
    const data = await api.get<BackendProduct[]>("/products")
    return data.map(transformProduct)
  },
  getById: async (id: string) => {
    const data = await api.get<BackendProduct>(`/products/${id}`)
    return transformProduct(data)
  },
  getMyProducts: async () => {
    const data = await api.get<BackendProduct[]>("/products/my-products")
    return data.map(transformProduct)
  },
  create: async (data: CreateProductDto) => {
    const res = await api.post<BackendProduct>("/products", {
      ...data,
      // Ensure specific types related to backend expectation if needed, although backend DTO handles transform with @Type(() => Number)
      // but it's safer to send numbers from here if interface says so.
    })
    return transformProduct(res)
  },
  update: async (id: string, data: UpdateProductDto) => {
    const res = await api.patch<BackendProduct>(`/products/${id}`, data)
    return transformProduct(res)
  },
  delete: async (id: string) => {
    await api.delete(`/products/${id}`)
  }
}
