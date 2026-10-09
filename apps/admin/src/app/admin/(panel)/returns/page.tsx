import type { Metadata } from 'next'
import { ReturnList } from '@/components/returns/return-list'
import { parseReturnFilters } from '@/lib/return-filters'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Returns' }
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function ReturnsPage({ searchParams }: Props) {
  const { all, ...filters } = parseReturnFilters(await searchParams)
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <ReturnList filters={filters} all={all} />
    </main>
  )
}
