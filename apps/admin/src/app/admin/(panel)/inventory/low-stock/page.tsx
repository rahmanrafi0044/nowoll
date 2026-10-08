import type { Metadata } from 'next'
import { LowStockList } from '@/components/inventory/low-stock-list'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Low stock' }
}

export default function LowStockPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <LowStockList />
    </main>
  )
}
