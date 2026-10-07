import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ProductEditor } from '@/components/product-edit/product-editor'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Edit product' }
}

// In Next.js 16, params is a Promise.
type Props = { params: Promise<{ id: string }> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function EditProductPage({ params }: Props) {
  const { id } = await params
  if (!UUID.test(id)) notFound()
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <ProductEditor id={id} />
    </main>
  )
}
