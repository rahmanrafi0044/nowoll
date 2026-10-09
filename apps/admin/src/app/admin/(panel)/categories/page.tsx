import type { Metadata } from 'next'
import { CategoryTree } from '@/components/categories/category-tree'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Categories' }
}

export default function CategoriesPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <CategoryTree />
    </main>
  )
}
