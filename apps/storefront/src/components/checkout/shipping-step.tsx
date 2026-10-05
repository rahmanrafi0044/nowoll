'use client'

import { Button } from '@nowoll/ui'
import type { CheckoutQuoteView } from '@nowoll/types'
import { formatBdt } from '@/lib/format'
import { useCheckoutStore } from '@/stores/checkout-store'

export const deliveryEstimate = (s: NonNullable<CheckoutQuoteView['shipping']>) =>
  s.estimatedDaysMin && s.estimatedDaysMax
    ? `${s.estimatedDaysMin}–${s.estimatedDaysMax} days`
    : null

// One delivery option per zone for now — shown so the customer knows the fee
// and timing before paying (decision: zones are edited in Admin → Shipping).
export function ShippingStep({ quote }: { quote: CheckoutQuoteView | null }) {
  const complete = useCheckoutStore((s) => s.complete)
  const shipping = quote?.shipping
  if (!shipping) return <p className="text-muted-foreground">Working out delivery…</p>
  const estimate = deliveryEstimate(shipping)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between rounded-control border border-brand p-4">
        <div>
          <p className="font-medium">{shipping.name}</p>
          {estimate && <p className="text-sm text-muted-foreground">Delivery in {estimate}</p>}
        </div>
        <p className="font-semibold">
          {quote.totals.freeShipping ? 'Free' : formatBdt(quote.totals.shippingFee)}
        </p>
      </div>
      {!quote.totals.freeShipping && shipping.freeShippingThreshold && (
        <p className="text-sm text-muted-foreground">
          Free delivery on orders over {formatBdt(shipping.freeShippingThreshold)}.
        </p>
      )}
      <Button size="lg" onClick={() => complete('shipping')}>
        Continue to payment
      </Button>
    </div>
  )
}
