import type { Metadata } from 'next'
import Link from 'next/link'
import { FooterEditor } from '@/components/content/footer-editor'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Footer' }
}

export default function FooterPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Link
        href="/admin/content"
        className="text-sm text-muted-foreground underline underline-offset-4"
      >
        ← Content
      </Link>
      <div className="mt-2">
        <FooterEditor />
      </div>
    </main>
  )
}
