import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { EditPage } from '@/components/pages/page-editor'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Page' }
}

type Props = { params: Promise<{ id: string }> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function EditPagePage({ params }: Props) {
  const { id } = await params
  if (!UUID.test(id)) notFound()
  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <EditPage id={id} />
    </main>
  )
}
