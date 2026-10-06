import type { Metadata } from 'next'
import { ProductList } from '@/components/products/product-list'
import { parseFilters } from '@/lib/product-filters'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Products' }
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function ProductsPage({ searchParams }: Props) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <ProductList filters={parseFilters(await searchParams)} />
    </main>
  )
}
