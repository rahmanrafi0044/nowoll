import type { Metadata } from 'next'
import { SizeChartList } from '@/components/size-charts/size-chart-list'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Size charts' }
}

export default function SizeChartsPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <SizeChartList />
    </main>
  )
}
