export type Role = "CLIENT" | "PROVIDER" | "RUNNER" | "ADMIN"

// --- UI Interfaces (Clean) ---

export interface User {
  userId: number
  roles: Role[]
  email?: string
  name?: string
  createdAt?: string
  mfaEnabled?: boolean
}

export interface AuthTokens {
  access_token: string
}

export interface Product {
  id: string // UI uses string IDs usually
  name: string
  description: string
  price: number
  stock: number
  city: string
  category: string
  imageUrl?: string
  providerId: string
  provider?: {
    name: string
  }
  createdAt: string
  updatedAt?: string
}

export interface CartItem {
  product: Product
  quantity: number
}

export interface OrderItem {
  id: string
  productId: string
  quantity: number
  unitPrice: number
  product?: Product
}

export interface Order {
  id: string
  userId: string // optional/unknown
  total: number
  status: "PENDING" | "CONFIRMED" | "SHIPPED" | "DELIVERED" | "CANCELLED"
  createdAt: string
  items: OrderItem[]
  city?: string // mapped from backend city object if needed
  deliveryAddress?: string
}

export interface CreateOrderPayload {
  items: { productId: string; quantity: number }[]
  deliveryAddress?: string
}

export interface Sale {
  id: string
  productName: string
  quantity: number
  unitPrice: number
  total: number
  date: string
  status: string
  buyerEmail?: string
}

export interface ApiError {
  message: string
  statusCode: number
}

// --- Backend Interfaces (Raw API) ---

export interface BackendUser {
  userId: number
  roles: Role[]
  // ...
}

export interface BackendCity {
  id: number
  name: string
  slug: string
  active?: boolean
}

export interface BackendCategory {
  id: number
  name: string
  slug: string
  image_url?: string
}

export interface BackendProvider {
  id: number
  name: string
  email: string
}

export interface BackendProduct {
  id: number
  name: string
  description?: string
  price: string // Decimal string
  stock: number
  imageUrl?: string
  cityId: number
  city?: BackendCity
  categoryId: number
  category?: BackendCategory
  providerId: number
  provider?: BackendProvider
  createdAt: string
  updatedAt: string
}

export interface BackendOrderItem {
  id: number
  quantity: number
  priceAtPurchase: string // Decimal string
  productId: number
  product?: BackendProduct
}

export interface BackendOrder {
  id: number
  totalPrice: string // Decimal string
  status: "PENDING" | "CONFIRMED" | "SHIPPED" | "DELIVERED" | "CANCELLED"
  createdAt: string
  items: BackendOrderItem[]
  city?: BackendCity
}

export interface AdminMetrics {
  totalUsers: number
  totalProviders: number
  totalClients: number
  totalOrders: number
  totalRevenue: number
}

export interface BackendAdminUser {
  id: number
  email: string
  name: string
  roles: Role[]
  createdAt: string
  mfaEnabled: boolean
  active: boolean
}

export interface ProviderStats {
  totalRevenue: number
  totalOrders: number
  itemsSold: number
  averageTicket: number
}

export interface SalesChartData {
  date: string
  amount: number
}

export interface TopProduct {
  name: string
  revenue: number
  quantity: number
}
// --- DTOs (Data Transfer Objects) ---

export interface CreateProductDto {
  name: string
  description?: string
  price: number
  stock: number
  cityId: number
  categoryId: number
  imageUrl?: string
}

export type UpdateProductDto = Partial<CreateProductDto>

export interface CreateCityDto {
  name: string
  slug: string
  active?: boolean
}

export type UpdateCityDto = Partial<CreateCityDto>

export interface CreateCategoryDto {
  name: string
  slug: string
  image_url?: string
}

export type UpdateCategoryDto = Partial<CreateCategoryDto>
