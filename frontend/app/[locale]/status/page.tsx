import { PublicInfoPage } from "@/components/public-info-page"

export default async function StatusPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params

  return <PublicInfoPage locale={locale} pageKey="status" />
}
