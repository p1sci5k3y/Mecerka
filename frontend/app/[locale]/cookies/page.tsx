import { PublicInfoPage } from "@/components/public-info-page"

export default async function CookiesPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params

  return <PublicInfoPage locale={locale} pageKey="cookies" />
}
