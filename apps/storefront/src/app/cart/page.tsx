import type { Metadata } from 'next'
import type { ShippingRateView } from '@nowoll/types'
import { CartPageClient } from '@/components/cart/cart-page-client'
import { apiGet } from '@/lib/api'
import { freeDeliveryOffer } from '@/lib/free-delivery'

// The bag lives in the customer's browser, so this page is filled in there
// (spec: "Cart — client-side"). Nothing on it is useful to search engines.
export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Your bag', robots: { index: false, follow: false } }
}

export default async function CartPage() {
  const rates = await apiGet<ShippingRateView[]>('/shipping/rates') // cached 60 s
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-4xl">Your bag</h1>
      <div className="mt-6 [&>aside]:md:sticky [&>aside]:md:top-6 md:grid md:grid-cols-[1fr_20rem] md:items-start md:gap-10">
        <CartPageClient freeDelivery={freeDeliveryOffer(rates)} />
      </div>
    </div>
  )
}
