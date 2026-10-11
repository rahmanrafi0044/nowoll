import type { Metadata } from 'next'
import Link from 'next/link'
import { ProductInfoEditor } from '@/components/content/product-info-editor'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Product info' }
}

export default function ProductInfoPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Link
        href="/admin/content"
        className="text-sm text-muted-foreground underline underline-offset-4"
      >
        ← Content
      </Link>
      <div className="mt-2">
        <ProductInfoEditor />
      </div>
    </main>
  )
}
