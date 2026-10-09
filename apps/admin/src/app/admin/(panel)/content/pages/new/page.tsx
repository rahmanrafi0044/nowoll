import type { Metadata } from 'next'
import { NewPage } from '@/components/pages/page-editor'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'New page' }
}

export default function NewPagePage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <NewPage />
    </main>
  )
}
