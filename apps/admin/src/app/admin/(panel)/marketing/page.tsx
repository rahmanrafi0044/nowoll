import type { Metadata } from 'next'
import { MarketingPage } from '@/components/marketing/marketing-page'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Marketing' }
}

export default function AdminMarketingPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <MarketingPage />
    </main>
  )
}
