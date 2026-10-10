import type { Metadata } from 'next'
import { CheckoutSuccess } from '@/components/checkout/checkout-success'
import { getSettings } from '@/lib/settings'

// The order confirmation page (step 21): every order lands here — cash on
// delivery straight after "Place order", online orders when SSLCommerz sends
// the customer back. Being sent here proves nothing about payment — the page
// asks the API, which only says "paid" after SSLCommerz's validation API confirmed it.
export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Order confirmation', robots: { index: false, follow: false } }
}

export default async function PaymentSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string | string[] }>
}) {
  const { order } = await searchParams
  const { thank_you_message } = await getSettings() // Admin → Settings (step 38)
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <CheckoutSuccess
        orderId={typeof order === 'string' ? order : null}
        thankYouMessage={thank_you_message}
      />
    </div>
  )
}
