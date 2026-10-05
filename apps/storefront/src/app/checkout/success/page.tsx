import type { Metadata } from 'next'
import { PaymentConfirmation } from '@/components/checkout/payment-confirmation'

// Where SSLCommerz sends the customer after paying (via the API's /success
// redirect). Being sent here proves nothing — the page asks the API, which
// only says "paid" after SSLCommerz's validation API confirmed it.
export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Payment', robots: { index: false, follow: false } }
}

export default async function PaymentSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string | string[] }>
}) {
  const { order } = await searchParams
  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <PaymentConfirmation orderId={typeof order === 'string' ? order : null} />
    </div>
  )
}
