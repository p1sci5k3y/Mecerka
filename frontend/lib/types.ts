export type Role = "CLIENT" | "PROVIDER" | "RUNNER" | "ADMIN"

// --- UI Interfaces (Clean) ---

export interface User {
  userId: string
  roles: Role[]
  email?: string
  name?: string
  createdAt?: string
  mfaEnabled: boolean
  hasPin: boolean
  stripeAccountId?: string | null // Stripe Connect Connected Account ID for providers/runners
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
  priceAtPurchase?: number | string
  product?: Product
}

export interface ProviderOrder {
  id: string
  providerId: string
  status: "PENDING" | "ACCEPTED" | "PREPARING" | "READY_FOR_PICKUP" | "PICKED_UP" | "DELIVERED" | "CANCELLED" | "REJECTED_BY_STORE"
  subtotal: number
  items: OrderItem[]
  createdAt?: string
  updatedAt?: string
}

export interface Order {
  id: string
  userId: string // optional/unknown
  total: number
  deliveryFee: number
  status: "PENDING" | "CONFIRMED" | "READY_FOR_ASSIGNMENT" | "ASSIGNED" | "IN_TRANSIT" | "DELIVERED" | "CANCELLED"
  createdAt: string
  updatedAt?: string
  items: OrderItem[]
  providerOrders?: ProviderOrder[]
  city?: string // mapped from backend city object if needed
  deliveryAddress?: string
  deliveryLat?: number
  deliveryLng?: number
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

export interface RequestRolePayload {
  role: "PROVIDER" | "RUNNER"
  country: string
  fiscalId: string
}

export interface RequestRoleResponse {
  message: string
  userId: string
  requestedRole: Role
  roleStatus: string
  requestedAt: string
  roles: Role[]
}

// --- Backend Interfaces (Raw API) ---

export interface BackendUser {
  userId: string
  roles: Role[]
  // ...
}

export interface BackendCity {
  id: string
  name: string
  slug: string
  active?: boolean
}

export interface BackendCategory {
  id: string
  name: string
  slug: string
  image_url?: string
}

export interface BackendProvider {
  id: string
  name: string
  email: string
}

export interface BackendProduct {
  id: string
  name: string
  description?: string
  price: string // Decimal string
  stock: number
  imageUrl?: string
  cityId: string
  city?: BackendCity
  categoryId: string
  category?: BackendCategory
  providerId: string
  provider?: BackendProvider
  createdAt: string
  updatedAt: string
}

export interface BackendOrderItem {
  id: string
  quantity: number
  priceAtPurchase: string // Decimal string
  productId: string
  product?: BackendProduct
}

export interface BackendProviderOrder {
  id: string
  providerId: string
  status: "PENDING" | "ACCEPTED" | "PREPARING" | "READY_FOR_PICKUP" | "PICKED_UP" | "DELIVERED" | "CANCELLED" | "REJECTED_BY_STORE"
  subtotal: string
  createdAt?: string
  updatedAt?: string
  items: BackendOrderItem[]
}

export interface BackendOrder {
  id: string
  totalPrice: string // Decimal string
  deliveryFee: string // Decimal string
  status: "PENDING" | "CONFIRMED" | "READY_FOR_ASSIGNMENT" | "ASSIGNED" | "IN_TRANSIT" | "DELIVERED" | "CANCELLED"
  createdAt: string
  updatedAt?: string
  items?: BackendOrderItem[]
  providerOrders?: BackendProviderOrder[]
  city?: BackendCity
  deliveryLat?: number
  deliveryLng?: number
}

export interface AdminMetrics {
  totalUsers: number
  totalProviders: number
  totalClients: number
  totalOrders: number
  totalRevenue: number
}

export interface BackendAdminUser {
  id: string
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
  cityId: string
  categoryId: string
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
