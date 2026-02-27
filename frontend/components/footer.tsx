import { Link } from "@/lib/navigation"
import { BrandMark, BrandWordmark } from "@/components/brand-mark"

const footerLinks = {
  Plataforma: [
    { label: "Catálogo", href: "/products" },
    { label: "Iniciar sesión", href: "/login" },
    { label: "Registrarse", href: "/register" },
  ],
  Legal: [
    { label: "Privacidad", href: "#" },
    { label: "Términos", href: "#" },
    { label: "Cookies", href: "#" },
  ],
  Soporte: [
    { label: "FAQ", href: "#" },
    { label: "Contacto", href: "#" },
    { label: "Estado", href: "#" },
  ],
}

export function Footer() {
  return (
    <footer className="border-t border-border bg-secondary/50">
      <div className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
        <div className="grid gap-8 md:grid-cols-4">
          <div className="flex flex-col gap-4">
            <Link href="/" className="flex items-center gap-2 group">
              <BrandMark className="text-primary group-hover:text-accent transition-colors" size={24} />
              <BrandWordmark className="text-xl" />
            </Link>
            <p className="text-sm leading-relaxed text-muted-foreground font-medium">
              El mercado vivo de tu ciudad. <br />
              Donde la artesanía local, los talleres de barrio y la confianza de siempre encuentran su lugar en la red.
            </p>
          </div>
          {Object.entries(footerLinks).map(([title, links]) => (
            <div key={title} className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-foreground">{title}</h3>
              <ul className="flex flex-col gap-2">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 border-t border-border pt-6">
          <p className="text-center text-xs text-muted-foreground">
            {new Date().getFullYear()} Mecerka. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </footer>
  )
}
