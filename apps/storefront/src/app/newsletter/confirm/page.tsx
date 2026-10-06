import type { Metadata } from 'next'
import { NewsletterAction } from '@/components/newsletter/newsletter-action'
import { isToken } from '@/lib/newsletter-api'

// The link in the newsletter email lands here (step 28): /newsletter/confirm?token=…
export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Confirm your subscription', robots: { index: false, follow: false } }
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>
}) {
  const { token } = await searchParams
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Confirm your subscription</h1>
      <div className="mt-6">
        <NewsletterAction kind="confirm" token={isToken(token) ? token : null} />
      </div>
    </div>
  )
}
