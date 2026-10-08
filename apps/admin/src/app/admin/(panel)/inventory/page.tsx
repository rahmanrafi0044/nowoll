import type { Metadata } from 'next'
import { InventoryList } from '@/components/inventory/inventory-list'
import { parseInventoryFilters } from '@/lib/inventory-filters'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Inventory' }
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function InventoryPage({ searchParams }: Props) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <InventoryList filters={parseInventoryFilters(await searchParams)} />
    </main>
  )
}
