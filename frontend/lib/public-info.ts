import { normalizeLocale, type SupportedLocale } from "@/lib/public-copy"

export type PublicInfoPageKey =
  | "privacy"
  | "terms"
  | "cookies"
  | "faq"
  | "contact"
  | "status"

type PublicInfoLink = {
  href: `/${PublicInfoPageKey}` | "/products" | "/login" | "/register"
  label: string
}

type PublicInfoSection = {
  title: string
  links: PublicInfoLink[]
}

type PublicInfoPageSection = {
  title: string
  body: string[]
}

type PublicInfoPage = {
  title: string
  intro: string
  sections: PublicInfoPageSection[]
}

const footerContent = {
  es: {
    brandDescription:
      "El mercado vivo de tu ciudad. Donde la artesanía local, los talleres de barrio y la confianza de siempre encuentran su lugar en la red.",
    sections: [
      {
        title: "Plataforma",
        links: [
          { label: "Catálogo", href: "/products" },
          { label: "Iniciar sesión", href: "/login" },
          { label: "Registrarse", href: "/register" },
        ],
      },
      {
        title: "Legal",
        links: [
          { label: "Privacidad", href: "/privacy" },
          { label: "Términos", href: "/terms" },
          { label: "Cookies", href: "/cookies" },
        ],
      },
      {
        title: "Soporte",
        links: [
          { label: "FAQ", href: "/faq" },
          { label: "Contacto", href: "/contact" },
          { label: "Estado", href: "/status" },
        ],
      },
    ] satisfies PublicInfoSection[],
  },
  en: {
    brandDescription:
      "The living market of your city. Where local craftsmanship, neighborhood workshops and trusted commerce find their place online.",
    sections: [
      {
        title: "Platform",
        links: [
          { label: "Catalog", href: "/products" },
          { label: "Sign in", href: "/login" },
          { label: "Register", href: "/register" },
        ],
      },
      {
        title: "Legal",
        links: [
          { label: "Privacy", href: "/privacy" },
          { label: "Terms", href: "/terms" },
          { label: "Cookies", href: "/cookies" },
        ],
      },
      {
        title: "Support",
        links: [
          { label: "FAQ", href: "/faq" },
          { label: "Contact", href: "/contact" },
          { label: "Status", href: "/status" },
        ],
      },
    ] satisfies PublicInfoSection[],
  },
} satisfies Record<SupportedLocale, { brandDescription: string; sections: PublicInfoSection[] }>

const pageContent = {
  es: {
    privacy: {
      title: "Política de Privacidad",
      intro:
        "Mecerka trata los datos mínimos necesarios para gestionar cuentas, pedidos, pagos y soporte dentro del marketplace.",
      sections: [
        {
          title: "Qué datos tratamos",
          body: [
            "Datos de registro y autenticación, información de perfil, direcciones de entrega y trazas operativas asociadas a pedidos y pagos.",
            "No utilizamos estos datos para publicidad ajena al servicio ni para cesiones comerciales a terceros.",
          ],
        },
        {
          title: "Para qué los usamos",
          body: [
            "Prestación del servicio, prevención de fraude, atención al usuario y cumplimiento de obligaciones fiscales y de seguridad.",
          ],
        },
      ],
    },
    terms: {
      title: "Términos del Servicio",
      intro:
        "El uso de Mecerka implica aceptar las reglas básicas de acceso, compra local, uso responsable y respeto a proveedores y repartidores.",
      sections: [
        {
          title: "Uso permitido",
          body: [
            "La plataforma está orientada a compraventa local legítima. Queda prohibido su uso para fraude, acoso, suplantación o manipulación del catálogo.",
          ],
        },
        {
          title: "Pedidos y pagos",
          body: [
            "Los pedidos quedan sujetos a disponibilidad, validación operativa, políticas de cancelación y verificación de pago.",
          ],
        },
      ],
    },
    cookies: {
      title: "Política de Cookies",
      intro:
        "Mecerka utiliza cookies técnicas y de sesión necesarias para autenticación, idioma, carrito y seguridad de la experiencia.",
      sections: [
        {
          title: "Cookies necesarias",
          body: [
            "Permiten iniciar sesión, mantener la sesión activa, recordar el idioma y proteger flujos sensibles como checkout y MFA.",
          ],
        },
        {
          title: "Preferencias",
          body: [
            "Si en el futuro se añaden cookies analíticas o de terceros, se comunicarán y se separarán de las estrictamente necesarias.",
          ],
        },
      ],
    },
    faq: {
      title: "Preguntas Frecuentes",
      intro:
        "Resumen rápido de las dudas más habituales sobre registro, pedidos, entregas, pagos y roles dentro de la plataforma.",
      sections: [
        {
          title: "Cómo comprar",
          body: [
            "Crea una cuenta, añade productos del mismo ámbito operativo al carrito y completa el checkout con una dirección válida.",
          ],
        },
        {
          title: "Cómo vender o repartir",
          body: [
            "El alta pública es como cliente. Los roles privilegiados se solicitan después desde una cuenta verificada.",
          ],
        },
      ],
    },
    contact: {
      title: "Contacto",
      intro:
        "Para incidencias funcionales, dudas académicas o soporte operativo del entorno de demostración, centralizamos el contacto por correo.",
      sections: [
        {
          title: "Canales disponibles",
          body: [
            "Correo principal: soporte@mecerka.me",
            "Para incidencias de cuenta o pedido, incluye el identificador afectado y una breve descripción reproducible.",
          ],
        },
      ],
    },
    status: {
      title: "Estado del Servicio",
      intro:
        "La disponibilidad pública de Mecerka se monitoriza de forma operativa básica. Esta página resume el estado esperado de los componentes visibles.",
      sections: [
        {
          title: "Servicios públicos",
          body: [
            "Web pública, API, autenticación y checkout deberían estar operativos en condiciones normales.",
          ],
        },
        {
          title: "Incidencias",
          body: [
            "Si detectas una caída o comportamiento anómalo, notifícalo por el canal de soporte indicando entorno, hora aproximada y pasos de reproducción.",
          ],
        },
      ],
    },
  },
  en: {
    privacy: {
      title: "Privacy Policy",
      intro:
        "Mecerka processes the minimum data required to manage accounts, orders, payments and support within the marketplace.",
      sections: [
        {
          title: "What data we process",
          body: [
            "Registration and authentication data, profile information, delivery addresses and operational traces linked to orders and payments.",
            "We do not use this data for unrelated advertising or commercial resale.",
          ],
        },
        {
          title: "Why we use it",
          body: [
            "Service delivery, fraud prevention, user support and compliance with fiscal and security obligations.",
          ],
        },
      ],
    },
    terms: {
      title: "Terms of Service",
      intro:
        "Using Mecerka implies accepting the basic rules for access, local purchases, responsible use and respectful behavior toward providers and runners.",
      sections: [
        {
          title: "Allowed use",
          body: [
            "The platform is intended for legitimate local commerce. Fraud, harassment, impersonation and catalog manipulation are prohibited.",
          ],
        },
        {
          title: "Orders and payments",
          body: [
            "Orders remain subject to availability, operational validation, cancellation rules and payment verification.",
          ],
        },
      ],
    },
    cookies: {
      title: "Cookie Policy",
      intro:
        "Mecerka uses technical and session cookies required for authentication, language selection, cart state and secure flows.",
      sections: [
        {
          title: "Necessary cookies",
          body: [
            "They allow sign-in, active session persistence, locale selection and protection of sensitive flows such as checkout and MFA.",
          ],
        },
        {
          title: "Preferences",
          body: [
            "If analytics or third-party cookies are added in the future, they will be clearly disclosed and separated from the strictly necessary set.",
          ],
        },
      ],
    },
    faq: {
      title: "FAQ",
      intro:
        "A quick overview of common questions about registration, orders, deliveries, payments and role requests.",
      sections: [
        {
          title: "How to buy",
          body: [
            "Create an account, add products from the same operational area to the cart and complete checkout with a valid address.",
          ],
        },
        {
          title: "How to sell or deliver",
          body: [
            "Public signup creates a client account. Privileged roles are requested later from a verified account.",
          ],
        },
      ],
    },
    contact: {
      title: "Contact",
      intro:
        "Functional issues, academic questions and demo-environment support are handled through a single contact channel.",
      sections: [
        {
          title: "Available channels",
          body: [
            "Primary email: soporte@mecerka.me",
            "For account or order incidents, include the affected identifier and a short reproducible description.",
          ],
        },
      ],
    },
    status: {
      title: "Service Status",
      intro:
        "Mecerka public availability is monitored at a basic operational level. This page summarizes the expected status of user-facing services.",
      sections: [
        {
          title: "Public services",
          body: [
            "Public web, API, authentication and checkout should be operational under normal conditions.",
          ],
        },
        {
          title: "Incidents",
          body: [
            "If you detect downtime or abnormal behavior, report it through support with the environment, approximate time and reproduction steps.",
          ],
        },
      ],
    },
  },
} satisfies Record<SupportedLocale, Record<PublicInfoPageKey, PublicInfoPage>>

export function getFooterContent(locale: string) {
  return footerContent[normalizeLocale(locale)]
}

export function getPublicInfoPage(locale: string, pageKey: PublicInfoPageKey) {
  return pageContent[normalizeLocale(locale)][pageKey]
}
