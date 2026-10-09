import type { Metadata } from 'next'
import Link from 'next/link'
import { ArchivedCategories } from '@/components/categories/archived-categories'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Archived categories' }
}

export default function ArchivedCategoriesPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Link
        href="/admin/categories"
        className="text-sm text-muted-foreground underline underline-offset-4"
      >
        ← Categories
      </Link>
      <div className="mt-2">
        <ArchivedCategories />
      </div>
    </main>
  )
}
