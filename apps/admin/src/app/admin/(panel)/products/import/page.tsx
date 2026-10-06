import type { Metadata } from 'next'
import Link from 'next/link'
import { ImportCsv } from '@/components/products/import-csv'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Import products' }
}

export default function ImportProductsPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Link
        href="/admin/products"
        className="text-sm text-muted-foreground underline underline-offset-4"
      >
        ← Products
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold">Import products from CSV</h1>
      <ImportCsv />
    </main>
  )
}
