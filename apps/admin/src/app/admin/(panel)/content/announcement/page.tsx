import type { Metadata } from 'next'
import Link from 'next/link'
import { AnnouncementEditor } from '@/components/content/announcement-editor'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Announcement bar' }
}

export default function AnnouncementPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Link
        href="/admin/content"
        className="text-sm text-muted-foreground underline underline-offset-4"
      >
        ← Content
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold">Announcement bar</h1>
      <AnnouncementEditor />
    </main>
  )
}
