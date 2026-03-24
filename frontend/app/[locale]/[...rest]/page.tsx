import { redirect } from "next/navigation"
import { normalizeLocale } from "@/lib/public-copy"

export default async function LocaleCatchAllPage({
  params,
}: {
  params: Promise<{ locale: string; rest: string[] }>
}) {
  const { locale } = await params

  redirect(`/${normalizeLocale(locale)}`)
}
