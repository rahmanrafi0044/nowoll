import type { Metadata } from 'next'
import Link from 'next/link'
import { NewProductForm } from '@/components/product-edit/new-product-form'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'New product' }
}

export default function NewProductPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Link
        href="/admin/products"
        className="text-sm text-muted-foreground underline underline-offset-4"
      >
        ← Products
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold">New product</h1>
      <NewProductForm />
    </main>
  )
}
