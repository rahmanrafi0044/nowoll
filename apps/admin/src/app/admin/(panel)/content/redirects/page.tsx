import type { Metadata } from 'next'
import Link from 'next/link'
import { RedirectsPage } from '@/components/redirects/redirects-page'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Redirects' }
}

export default function AdminRedirectsPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Link
        href="/admin/content"
        className="text-sm text-muted-foreground underline underline-offset-4"
      >
        ← Content
      </Link>
      <div className="mt-2">
        <RedirectsPage />
      </div>
    </main>
  )
}
