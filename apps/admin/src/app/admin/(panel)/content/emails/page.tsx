import type { Metadata } from 'next'
import Link from 'next/link'
import { EmailWordingEditor } from '@/components/content/email-wording-editor'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Emails' }
}

export default function EmailsPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Link
        href="/admin/content"
        className="text-sm text-muted-foreground underline underline-offset-4"
      >
        ← Content
      </Link>
      <div className="mt-2">
        <EmailWordingEditor />
      </div>
    </main>
  )
}
