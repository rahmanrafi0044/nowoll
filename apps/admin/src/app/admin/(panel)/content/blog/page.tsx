import type { Metadata } from 'next'
import { BlogList } from '@/components/blog/blog-list'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Blog' }
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function BlogPage({ searchParams }: Props) {
  const { archived } = await searchParams
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <BlogList archived={archived === '1'} />
    </main>
  )
}
