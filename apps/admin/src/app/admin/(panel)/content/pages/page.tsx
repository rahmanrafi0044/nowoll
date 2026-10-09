import type { Metadata } from 'next'
import { PageList } from '@/components/pages/page-list'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Pages' }
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function PagesPage({ searchParams }: Props) {
  const { archived } = await searchParams
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <PageList archived={archived === '1'} />
    </main>
  )
}
