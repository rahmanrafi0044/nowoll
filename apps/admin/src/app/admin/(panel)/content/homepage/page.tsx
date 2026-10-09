import type { Metadata } from 'next'
import Link from 'next/link'
import { HomepageEditor } from '@/components/content/homepage-editor'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Homepage' }
}

export default function HomepageContentPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Link
        href="/admin/content"
        className="text-sm text-muted-foreground underline underline-offset-4"
      >
        ← Content
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold">Homepage</h1>
      <HomepageEditor />
    </main>
  )
}
