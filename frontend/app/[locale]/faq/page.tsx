import { PublicInfoPage } from "@/components/public-info-page"

export default async function FaqPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params

  return <PublicInfoPage locale={locale} pageKey="faq" />
}
