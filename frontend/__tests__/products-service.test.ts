import { beforeEach, describe, expect, it, vi } from "vitest"
import { productsService } from "@/lib/services/products-service"

const apiGetMock = vi.fn()
const apiPostMock = vi.fn()
const apiPatchMock = vi.fn()
const apiDeleteMock = vi.fn()

vi.mock("@/lib/api", () => ({
  api: {
    get: (...args: unknown[]) => apiGetMock(...args),
    post: (...args: unknown[]) => apiPostMock(...args),
    patch: (...args: unknown[]) => apiPatchMock(...args),
    delete: (...args: unknown[]) => apiDeleteMock(...args),
  },
}))

function makeBackendProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: "prod-1",
    name: "Jarron",
    description: "Ceramica local",
    price: "15.00",
    discountPrice: "12.00",
    stock: 8,
    imageUrl: "https://img.test/jarron.jpg",
    cityId: "city-1",
    city: { id: "city-1", name: "Sevilla", slug: "sevilla" },
    categoryId: "cat-1",
    category: { id: "cat-1", name: "Ceramica", slug: "ceramica" },
    providerId: "provider-9",
    provider: { id: "provider-9", name: "Maker Sur", email: "maker@test.dev" },
    createdAt: "2026-03-24T10:00:00.000Z",
    updatedAt: "2026-03-24T10:00:00.000Z",
    ...overrides,
  }
}

describe("products-service", () => {
  beforeEach(() => {
    apiGetMock.mockReset()
    apiPostMock.mockReset()
    apiPatchMock.mockReset()
    apiDeleteMock.mockReset()
  })

  it("normalizes product lists and applies discount prices", async () => {
    apiGetMock.mockResolvedValueOnce([makeBackendProduct()])

    const products = await productsService.getAll()

    expect(apiGetMock).toHaveBeenCalledWith("/products")
    expect(products[0]).toMatchObject({
      id: "prod-1",
      price: 12,
      basePrice: 15,
      discountPrice: 12,
      city: "Sevilla",
      category: "Ceramica",
      providerId: "provider-9",
      provider: { name: "Maker Sur" },
    })
  })

  it("falls back to defaults when backend city, category or description are missing", async () => {
    apiGetMock.mockResolvedValueOnce(
      makeBackendProduct({
        description: undefined,
        discountPrice: null,
        city: undefined,
        category: undefined,
      }),
    )

    const product = await productsService.getById("prod-1")

    expect(product).toMatchObject({
      description: "",
      price: 15,
      basePrice: 15,
      discountPrice: null,
      city: "Desconocida",
      category: "General",
    })
  })

  it("creates and updates products through the api service", async () => {
    apiPostMock.mockResolvedValueOnce(makeBackendProduct({ id: "prod-new" }))
    apiPatchMock.mockResolvedValueOnce(makeBackendProduct({ name: "Jarron XL" }))

    const created = await productsService.create({
      name: "Nuevo producto",
      description: "desc",
      price: 10,
      stock: 2,
      categoryId: "cat-1",
      cityId: "city-1",
    })
    const updated = await productsService.update("prod-1", {
      name: "Jarron XL",
    })

    expect(apiPostMock).toHaveBeenCalledWith("/products", {
      name: "Nuevo producto",
      description: "desc",
      price: 10,
      stock: 2,
      categoryId: "cat-1",
      cityId: "city-1",
    })
    expect(apiPatchMock).toHaveBeenCalledWith("/products/prod-1", {
      name: "Jarron XL",
    })
    expect(created.id).toBe("prod-new")
    expect(updated.name).toBe("Jarron XL")
  })

  it("forwards deletes through the api service", async () => {
    apiDeleteMock.mockResolvedValueOnce({})

    await productsService.delete("prod-1")

    expect(apiDeleteMock).toHaveBeenCalledWith("/products/prod-1")
  })
})
