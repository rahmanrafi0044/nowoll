import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { EditBlogPost } from '@/components/blog/blog-editor'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Post' }
}

type Props = { params: Promise<{ id: string }> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function EditBlogPostPage({ params }: Props) {
  const { id } = await params
  if (!UUID.test(id)) notFound()
  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <EditBlogPost id={id} />
    </main>
  )
}
