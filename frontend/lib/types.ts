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
  basePrice?: number
  discountPrice?: number | null
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

export interface CartLineItem {
  id: string
  productId: string
  quantity: number
  unitPrice: number
  baseUnitPrice: number
  appliedDiscountUnitPrice: number | null
  discountAmount: number
  subtotal: number
  originalSubtotal: number
  product: Product
  source: "guest" | "server"
}

export interface CartProviderGroup {
  id: string
  providerId: string
  providerName: string
  subtotalAmount: number
  originalSubtotalAmount: number
  discountAmount: number
  itemCount: number
  items: CartLineItem[]
}

export interface CartView {
  id?: string
  cityId?: string | null
  cityName?: string | null
  providerGroups: CartProviderGroup[]
  totalItems: number
  totalPrice: number
  originalTotalPrice?: number
  discountAmount?: number
  source: "guest" | "server"
}

export interface CheckoutProviderOrderResult {
  id: string
  providerId: string
  paymentStatus: string
  deliveryDistanceKm?: number | null
  coverageLimitKm?: number | null
}

export interface ProviderPaymentSessionSummary {
  providerOrderId: string
  paymentSessionId: string
  externalSessionId?: string | null
  clientSecret?: string | null
  stripeAccountId?: string | null
  expiresAt?: string | null
  paymentStatus: string
}

export interface ProviderOrderPaymentSummary {
  providerOrderId: string
  providerId: string
  providerName?: string
  subtotalAmount: number
  originalSubtotalAmount: number
  discountAmount: number
  status: string
  paymentStatus: string
  paymentRequired: boolean
  paymentSession: ProviderPaymentSessionSummary | null
}

export interface RunnerPaymentSummary {
  paymentMode: string
  deliveryOrderId: string | null
  runnerId: string | null
  deliveryStatus: string | null
  paymentStatus: string
  paymentRequired: boolean
  sessionPrepared: boolean
  amount: number
  currency: string
  pricingDistanceKm: number
  pickupCount: number
  additionalPickupCount: number
  baseFee: number
  perKmFee: number
  distanceFee: number
  extraPickupFee: number
  extraPickupCharge: number
}

export interface RunnerPaymentSessionSummary {
  deliveryOrderId: string
  runnerPaymentSessionId: string
  externalSessionId?: string | null
  clientSecret?: string | null
  stripeAccountId?: string | null
  expiresAt?: string | null
  paymentStatus: string
}

export interface OrderProviderPaymentsAggregate {
  orderId: string
  orderStatus: string
  paymentMode: "PROVIDER_ORDER_SESSIONS"
  paymentEnvironment?: "READY" | "UNAVAILABLE"
  paymentEnvironmentMessage?: string | null
  providerPaymentStatus: "UNPAID" | "PARTIALLY_PAID" | "PAID"
  paidProviderOrders: number
  totalProviderOrders: number
  providerOrders: ProviderOrderPaymentSummary[]
  runnerPayment: RunnerPaymentSummary
}

export interface CheckoutOrderResult {
  id: string
  status: string
  cityId?: string
  deliveryAddress?: string
  postalCode?: string | null
  addressReference?: string | null
  deliveryLat?: number | null
  deliveryLng?: number | null
  discoveryRadiusKm?: number | null
  providerOrders: CheckoutProviderOrderResult[]
}

export interface OrderItem {
  id: string
  productId: string
  quantity: number
  unitPrice: number
  baseUnitPrice: number
  appliedDiscountUnitPrice: number | null
  discountAmount: number
  priceAtPurchase?: number | string
  product?: Product
}

export interface ProviderOrder {
  id: string
  providerId: string
  providerName?: string
  status: "PENDING" | "ACCEPTED" | "PREPARING" | "READY_FOR_PICKUP" | "PICKED_UP" | "DELIVERED" | "CANCELLED" | "REJECTED_BY_STORE"
  paymentStatus?: string
  subtotal: number
  originalSubtotal: number
  discountAmount: number
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
  deliveryOrder?: {
    id: string
    runnerId: string | null
    status: string
    paymentStatus: string
  } | null
  city?: string // mapped from backend city object if needed
  deliveryAddress?: string
  postalCode?: string
  addressReference?: string | null
  deliveryLat?: number
  deliveryLng?: number
  discoveryRadiusKm?: number | null
  deliveryDistanceKm?: number | null
  runnerBaseFee?: number | null
  runnerPerKmFee?: number | null
  runnerExtraPickupFee?: number | null
}

export interface CreateOrderPayload {
  items: { productId: string; quantity: number }[]
  deliveryAddress?: string
}

export interface CheckoutCartPayload {
  cityId: string
  deliveryAddress: string
  postalCode: string
  addressReference?: string
  discoveryRadiusKm: number
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
  discountPrice?: string | null
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
  unitBasePriceSnapshot?: string | null
  discountPriceSnapshot?: string | null
  productId: string
  product?: BackendProduct
}

export interface BackendProviderOrder {
  id: string
  providerId: string
  provider?: {
    id: string
    name: string
  }
  status: "PENDING" | "ACCEPTED" | "PREPARING" | "READY_FOR_PICKUP" | "PICKED_UP" | "DELIVERED" | "CANCELLED" | "REJECTED_BY_STORE"
  paymentStatus?: string
  subtotalAmount: string
  createdAt?: string
  updatedAt?: string
  items: BackendOrderItem[]
}

export interface BackendDeliveryOrderSummary {
  id: string
  runnerId: string | null
  status: string
  paymentStatus: string
}

export interface BackendOrder {
  id: string
  totalPrice: string // Decimal string
  deliveryFee: string // Decimal string
  deliveryDistanceKm?: string | null
  runnerBaseFee?: string | null
  runnerPerKmFee?: string | null
  runnerExtraPickupFee?: string | null
  status: "PENDING" | "CONFIRMED" | "READY_FOR_ASSIGNMENT" | "ASSIGNED" | "IN_TRANSIT" | "DELIVERED" | "CANCELLED"
  createdAt: string
  updatedAt?: string
  items?: BackendOrderItem[]
  providerOrders?: BackendProviderOrder[]
  deliveryOrder?: BackendDeliveryOrderSummary | null
  city?: BackendCity
  deliveryAddress?: string
  postalCode?: string
  addressReference?: string | null
  deliveryLat?: number
  deliveryLng?: number
  discoveryRadiusKm?: number | null
}

export interface BackendCartItem {
  id: string
  productId: string
  quantity: number
  productReferenceSnapshot: string
  productNameSnapshot: string
  imageUrlSnapshot?: string | null
  unitPriceSnapshot: string
  discountPriceSnapshot?: string | null
  effectiveUnitPriceSnapshot: string
}

export interface BackendCartProvider {
  id: string
  providerId: string
  subtotalAmount: string
  itemCount: number
  provider: {
    id: string
    name: string
  }
  items: BackendCartItem[]
}

export interface BackendCartGroup {
  id: string
  clientId: string
  cityId?: string | null
  status: string
  city?: BackendCity | null
  providers: BackendCartProvider[]
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
