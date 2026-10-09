import type { Metadata } from 'next'
import { DiscountList } from '@/components/discounts/discount-list'
import { parseDiscountFilters } from '@/lib/discount-filters'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Discount codes' }
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function DiscountsPage({ searchParams }: Props) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <DiscountList filters={parseDiscountFilters(await searchParams)} />
    </main>
  )
}
