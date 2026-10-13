import type { Metadata } from 'next'
import { AnalyticsPage } from '@/components/analytics/analytics-page'
import { parsePeriod } from '@/lib/analytics-period'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Analytics' }
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

// The period comes from the address (?range=last7 or ?from=…&to=…); presets
// are counted from today in Bangladesh, so this page is worked out per request.
export default async function AdminAnalyticsPage({ searchParams }: Props) {
  const period = parsePeriod(await searchParams, new Date())
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <AnalyticsPage key={`${period.from}-${period.to}`} period={period} />
    </main>
  )
}
