import type { Metadata } from 'next'
import { TrackOrder } from '@/components/orders/track-order'

// Spec: "Order Tracking — /orders/track — Server (no auth required)". The
// page is server-rendered (and findable in search: "nowoll track order");
// the lookup itself runs in the browser so the customer's email or phone is
// sent in a POST body — never put in the page address.
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Track your order',
    description:
      'Check where your order is — enter your order number and the email or mobile number you used at checkout.',
    alternates: { canonical: '/orders/track' },
  }
}

export default function TrackOrderPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Track your order</h1>
      <p className="mt-2 text-muted-foreground">
        No account needed — use the order number from your confirmation.
      </p>
      <div className="mt-8">
        <TrackOrder />
      </div>
    </div>
  )
}
