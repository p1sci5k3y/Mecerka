const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    credentials: "include",
    headers,
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const error = new Error(body.message || "Ha ocurrido un error")
    // @ts-ignore
    error.statusCode = res.status
    throw error
  }

  if (res.status === 204) return {} as T
  return res.json()
}

export const api = {
  get<T>(endpoint: string) {
    return request<T>(endpoint)
  },
  post<T>(endpoint: string, data?: unknown) {
    return request<T>(endpoint, {
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    })
  },
  patch<T>(endpoint: string, data?: unknown) {
    return request<T>(endpoint, {
      method: "PATCH",
      body: data ? JSON.stringify(data) : undefined,
    })
  },
  delete<T>(endpoint: string) {
    return request<T>(endpoint, { method: "DELETE" })
  },
}
