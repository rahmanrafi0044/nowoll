import type { Metadata } from 'next'
import { NewsletterAction } from '@/components/newsletter/newsletter-action'
import { isToken } from '@/lib/newsletter-api'

// The link in the newsletter email lands here (step 28): /newsletter/unsubscribe?token=…
export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Unsubscribe from our newsletter', robots: { index: false, follow: false } }
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>
}) {
  const { token } = await searchParams
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Unsubscribe from our newsletter</h1>
      <div className="mt-6">
        <NewsletterAction kind="unsubscribe" token={isToken(token) ? token : null} />
      </div>
    </div>
  )
}
