import type { Metadata } from 'next'
import { PaymentFailed } from '@/components/checkout/payment-failed'

// Where the customer lands when a payment failed or was cancelled on
// SSLCommerz. The order is still open, so they can try again (decision #2).
export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Payment not completed', robots: { index: false, follow: false } }
}

export default async function PaymentFailedPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string | string[]; reason?: string | string[] }>
}) {
  const { order, reason } = await searchParams
  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <PaymentFailed
        orderId={typeof order === 'string' ? order : null}
        reason={reason === 'cancel' ? 'cancel' : 'fail'}
      />
    </div>
  )
}
