import type { Metadata } from 'next'
import { NewSizeChart } from '@/components/size-charts/size-chart-form'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'New size chart' }
}

export default function NewSizeChartPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <NewSizeChart />
    </main>
  )
}
