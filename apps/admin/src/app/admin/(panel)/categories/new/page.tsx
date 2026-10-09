import type { Metadata } from 'next'
import { NewCategory } from '@/components/categories/category-form'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'New category' }
}

export default function NewCategoryPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <NewCategory />
    </main>
  )
}
