import { ArrowRight, MapPin, Hammer, ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { SectionHeader } from "@/components/ui/section-header"
import { SealBadge } from "@/components/ui/seal-badge"
import { Link } from "@/lib/navigation"
import { getPublicCopy } from "@/lib/public-copy"

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const copy = getPublicCopy(locale).home

  return (
    <div className="flex min-h-screen flex-col bg-background selection:bg-primary/20">
      <Navbar />
      <main className="flex-1">
        {/* Editorial Hero Section with Vintage Engraving Background */}
        <section
          className="relative overflow-hidden w-full bg-[#fbf6ee] py-24 lg:py-40 border-b border-border/50"
          style={{
            backgroundImage: `linear-gradient(to right, rgba(251, 246, 238, 0.4) 0%, rgba(251, 246, 238, 0.95) 55%, rgba(251, 246, 238, 1) 100%), url('/brand/hero-bg.png')`,
            backgroundPosition: "left center",
            backgroundSize: "cover",
            backgroundRepeat: "no-repeat"
          }}
        >
          <div className="container relative z-10 px-4 md:px-6 flex justify-end">
            <div className="flex w-full md:w-[55%] flex-col items-start gap-6 text-left">
              <SealBadge className="mb-2">{copy.badge}</SealBadge>

              <h1 className="font-display text-5xl font-extrabold tracking-tight sm:text-6xl lg:text-7xl text-foreground mix-blend-multiply">
                {copy.title}
              </h1>

              <p className="max-w-[32rem] leading-relaxed text-foreground/85 sm:text-xl font-medium mix-blend-multiply">
                {copy.subtitle}
              </p>

              <div className="mt-8 flex flex-col sm:flex-row gap-4">
                <Link href="/products">
                  <Button size="lg" className="h-14 px-8 text-base shadow-sm font-semibold">
                    {copy.primaryCta}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/register">
                  <Button size="lg" variant="outline" className="h-14 px-8 text-base border-primary/30 bg-background/50 hover:bg-background/80 backdrop-blur-sm font-semibold">
                    {copy.secondaryCta}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="container px-4 py-20 md:px-6">
          <SectionHeader
            title={copy.capabilitiesTitle}
            subtitle={copy.capabilitiesSubtitle}
            className="mb-12"
          />
          <div className="grid gap-8 md:grid-cols-3">
            <article className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Hammer className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-display text-xl font-bold">{copy.catalogTitle}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {copy.catalogBody}
              </p>
              <div className="mt-5">
                <Link href="/products">
                  <Button variant="outline" className="border-primary/20 hover:bg-primary/5">
                    {copy.catalogCta}
                  </Button>
                </Link>
              </div>
            </article>

            <article className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <ShieldCheck className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-display text-xl font-bold">{copy.accountTitle}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {copy.accountBody}
              </p>
              <div className="mt-5">
                <Link href="/register">
                  <Button variant="outline" className="border-primary/20 hover:bg-primary/5">
                    {copy.accountCta}
                  </Button>
                </Link>
              </div>
            </article>

            <article className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <MapPin className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-display text-xl font-bold">{copy.localCommerceTitle}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {copy.localCommerceBody}
              </p>
            </article>
          </div>
        </section>

      </main>
      <Footer />
    </div>
  )
}
