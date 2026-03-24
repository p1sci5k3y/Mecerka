import { getApiBaseUrl } from "@/lib/runtime-config"

class ApiError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  }

  const res = await fetch(`${getApiBaseUrl()}${endpoint}`, {
    ...options,
    credentials: "include",
    headers,
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(body.message || "Ha ocurrido un error", res.status)
  }

  if (res.status === 204) return {} as T
  return res.json()
}

export const api = {
  get<T>(endpoint: string) {
    return request<T>(endpoint)
  },
  post<T>(endpoint: string, data?: unknown, options: RequestInit = {}) {
    return request<T>(endpoint, {
      ...options,
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    })
  },
  patch<T>(endpoint: string, data?: unknown, options: RequestInit = {}) {
    return request<T>(endpoint, {
      ...options,
      method: "PATCH",
      body: data ? JSON.stringify(data) : undefined,
    })
  },
  delete<T>(endpoint: string, options: RequestInit = {}) {
    return request<T>(endpoint, { ...options, method: "DELETE" })
  },
}
