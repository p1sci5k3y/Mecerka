"use client"

import { BrandMark, BrandWordmark } from "@/components/brand-mark"
import { Link } from "@/lib/navigation"
import { useLocale } from "next-intl"
import { getFooterContent } from "@/lib/public-info"
import { getPublicCopy } from "@/lib/public-copy"

export function Footer() {
  const locale = useLocale()
  const content = getFooterContent(locale)
  const copy = getPublicCopy(locale)

  return (
    <footer className="border-t border-border bg-secondary/50">
      <div className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
        <div className="grid gap-8 md:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))]">
          <div className="flex flex-col gap-4">
            <Link href="/" className="flex items-center gap-2 group">
              <BrandMark className="text-primary group-hover:text-accent transition-colors" size={24} />
              <BrandWordmark className="text-xl" />
            </Link>
            <p className="text-sm leading-relaxed text-muted-foreground font-medium">
              {content.brandDescription}
            </p>
          </div>
          {content.sections.map((section) => (
            <div key={section.title} className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
              <ul className="flex flex-col gap-2">
                {section.links.map((link) => (
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
            {new Date().getFullYear()} Mecerka. {copy.footerRights}
          </p>
        </div>
      </div>
    </footer>
  )
}
