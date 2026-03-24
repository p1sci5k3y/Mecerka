export type SupportedLocale = "es" | "en"

type HomeCopy = {
  badge: string
  title: string
  subtitle: string
  primaryCta: string
  secondaryCta: string
  capabilitiesTitle: string
  capabilitiesSubtitle: string
  catalogTitle: string
  catalogBody: string
  catalogCta: string
  accountTitle: string
  accountBody: string
  accountCta: string
  localCommerceTitle: string
  localCommerceBody: string
}

type ProductsCopy = {
  title: string
  subtitle: string
  searchPlaceholder: string
  filterBy: string
  anyCity: string
  anyCategory: string
  loading: string
  loadError: string
  empty: string
}

type ProductDetailCopy = {
  backToCatalog: string
  notFound: string
  unitsAvailable: (stock: number) => string
  outOfStock: string
  quantity: string
  addToCart: string
  addedToCart: (name: string, quantity: number) => string
  noImageAlt: string
  recommendationsTitle: string
  recommendationsBody: string
}

export function normalizeLocale(locale: string): SupportedLocale {
  return locale === "en" ? "en" : "es"
}

export const publicCopy = {
  es: {
    footerRights: "Todos los derechos reservados.",
    home: {
      badge: "Auténtico & Local",
      title: "Apoya a los talleres de tu ciudad",
      subtitle:
        "Descubre productos únicos hechos a mano cerca de ti. Directamente de los creadores visuales e independientes a tu puerta.",
      primaryCta: "Explorar el mercado",
      secondaryCta: "Crear cuenta",
      capabilitiesTitle: "Lo que ya puedes hacer",
      capabilitiesSubtitle:
        "Superficie pública real del MVP, sin dependencias ocultas ni recorridos simulados.",
      catalogTitle: "Explorar catálogo real",
      catalogBody:
        "El catálogo público consume productos reales del backend. Desde ahí puedes añadir piezas al carrito y preparar tu compra.",
      catalogCta: "Ver catálogo",
      accountTitle: "Crear cuenta cliente",
      accountBody:
        "El alta pública crea cuentas cliente. Si después quieres vender o repartir, la solicitud de rol se hace desde tu perfil autenticado.",
      accountCta: "Crear cuenta",
      localCommerceTitle: "Comprar de forma local",
      localCommerceBody:
        "Puedes preparar tu cesta sin sesión y autenticarte justo antes del checkout. El flujo online actual ya soporta pedidos multiproveedor dentro de una misma ciudad.",
    } satisfies HomeCopy,
    products: {
      title: "Catálogo de productos",
      subtitle: "Explora todos los productos disponibles en tu ciudad",
      searchPlaceholder: "Busca por pieza, taller o técnica...",
      filterBy: "Filtrar por:",
      anyCity: "Cualquier ciudad",
      anyCategory: "Cualquier técnica/categoría",
      loading: "Cargando productos...",
      loadError: "No se pudieron cargar los productos",
      empty: "No se encontraron productos con estos filtros",
    } satisfies ProductsCopy,
    productDetail: {
      backToCatalog: "Volver al catálogo",
      notFound: "Producto no encontrado",
      unitsAvailable: (stock) => `${stock} unidades disponibles`,
      outOfStock: "Sin stock",
      quantity: "Cantidad",
      addToCart: "Añadir al carrito",
      addedToCart: (name, quantity) => `${name} (x${quantity}) añadido al carrito`,
      noImageAlt: "Producto sin imagen",
      recommendationsTitle: "Productos similares - Coming soon",
      recommendationsBody:
        "Recomendaciones basadas en categoría y ciudad (ML-ready). Integración de backend pendiente.",
    } satisfies ProductDetailCopy,
  },
  en: {
    footerRights: "All rights reserved.",
    home: {
      badge: "Authentic & Local",
      title: "Support the workshops in your city",
      subtitle:
        "Discover unique handmade products near you. Directly from independent makers to your doorstep.",
      primaryCta: "Explore the marketplace",
      secondaryCta: "Create account",
      capabilitiesTitle: "What you can already do",
      capabilitiesSubtitle:
        "Real public MVP surface, without hidden dependencies or fake walkthroughs.",
      catalogTitle: "Browse the live catalog",
      catalogBody:
        "The public catalog consumes real backend products. From there you can add items to the cart and prepare your purchase.",
      catalogCta: "View catalog",
      accountTitle: "Create a client account",
      accountBody:
        "Public signup creates client accounts. If you later want to sell or deliver, the role request is handled from your authenticated profile.",
      accountCta: "Create account",
      localCommerceTitle: "Buy locally",
      localCommerceBody:
        "You can prepare your basket without signing in and authenticate right before checkout. The current online flow already supports multi-provider orders within the same city.",
    } satisfies HomeCopy,
    products: {
      title: "Product catalog",
      subtitle: "Explore all products available in your city",
      searchPlaceholder: "Search by piece, workshop or craft...",
      filterBy: "Filter by:",
      anyCity: "Any city",
      anyCategory: "Any craft/category",
      loading: "Loading products...",
      loadError: "Products could not be loaded",
      empty: "No products matched these filters",
    } satisfies ProductsCopy,
    productDetail: {
      backToCatalog: "Back to catalog",
      notFound: "Product not found",
      unitsAvailable: (stock) => `${stock} units available`,
      outOfStock: "Out of stock",
      quantity: "Quantity",
      addToCart: "Add to cart",
      addedToCart: (name, quantity) => `${name} (x${quantity}) added to cart`,
      noImageAlt: "Product without image",
      recommendationsTitle: "Similar products - Coming soon",
      recommendationsBody:
        "Recommendations based on category and city (ML-ready). Backend integration pending.",
    } satisfies ProductDetailCopy,
  },
} satisfies Record<
  SupportedLocale,
  {
    footerRights: string
    home: HomeCopy
    products: ProductsCopy
    productDetail: ProductDetailCopy
  }
>

export function getPublicCopy(locale: string) {
  return publicCopy[normalizeLocale(locale)]
}
