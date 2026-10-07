import type { Metadata } from 'next'
import { OrderList } from '@/components/orders/order-list'
import { parseOrderFilters } from '@/lib/order-filters'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Orders' }
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function OrdersPage({ searchParams }: Props) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <OrderList filters={parseOrderFilters(await searchParams)} />
    </main>
  )
}
