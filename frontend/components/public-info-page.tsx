import { getPublicInfoPage, type PublicInfoPageKey } from "@/lib/public-info"
import { Footer } from "@/components/footer"
import { Navbar } from "@/components/navbar"

type Props = {
  locale: string
  pageKey: PublicInfoPageKey
}

export function PublicInfoPage({ locale, pageKey }: Props) {
  const page = getPublicInfoPage(locale, pageKey)

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="mx-auto flex max-w-4xl flex-col gap-10 px-4 py-12 lg:px-8">
        <header className="space-y-4">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">
            Mecerka
          </p>
          <h1 className="font-space-grotesk text-4xl font-semibold tracking-tight">
            {page.title}
          </h1>
          <p className="max-w-3xl text-base leading-7 text-muted-foreground">
            {page.intro}
          </p>
        </header>

        <div className="grid gap-6">
          {page.sections.map((section) => (
            <section
              key={section.title}
              className="rounded-2xl border border-border bg-card/80 p-6 shadow-sm"
            >
              <h2 className="mb-4 font-space-grotesk text-2xl font-semibold tracking-tight">
                {section.title}
              </h2>
              <div className="space-y-3 text-sm leading-7 text-muted-foreground">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  )
}
