import type { Metadata } from 'next'
import { NewsletterPage } from '@/components/newsletter/newsletter-page'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Newsletter' }
}

export default function AdminNewsletterPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <NewsletterPage />
    </main>
  )
}
