import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { EditCategory } from '@/components/categories/category-form'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Category' }
}

type Props = { params: Promise<{ id: string }> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function EditCategoryPage({ params }: Props) {
  const { id } = await params
  if (!UUID.test(id)) notFound()
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <EditCategory id={id} />
    </main>
  )
}
