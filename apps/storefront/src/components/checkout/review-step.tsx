'use client'

import type { CheckoutQuoteView } from '@nowoll/types'
import { Button } from '@nowoll/ui'
import { formatBdt } from '@/lib/format'
import { useCheckoutStore } from '@/stores/checkout-store'
import { paymentLabel } from './payment-step'
import { deliveryEstimate } from './shipping-step'

// The last look before paying: every detail in one place, each with a way back.
export function ReviewStep({ quote }: { quote: CheckoutQuoteView | null }) {
  const { contact, address, payment, goTo } = useCheckoutStore()
  if (!contact || !address || !payment) return null
  const estimate = quote?.shipping ? deliveryEstimate(quote.shipping) : null

  const rows: {
    label: string
    value: string
    step: 'contact' | 'address' | 'shipping' | 'payment'
  }[] = [
    {
      label: 'Contact',
      value: `${contact.fullName} · ${contact.email} · ${contact.phone}`,
      step: 'contact',
    },
    {
      label: 'Deliver to',
      value: [
        address.addressLine1,
        address.addressLine2,
        address.area,
        address.district,
        address.division,
        address.postalCode,
      ]
        .filter(Boolean)
        .join(', '),
      step: 'address',
    },
    {
      label: 'Delivery',
      value: quote?.shipping
        ? `${quote.shipping.name}${estimate ? `, ${estimate}` : ''} — ${quote.totals.freeShipping ? 'Free' : formatBdt(quote.totals.shippingFee)}`
        : '…',
      step: 'shipping',
    },
    { label: 'Payment', value: paymentLabel(payment), step: 'payment' },
  ]

  return (
    <div className="flex flex-col gap-5">
      <dl className="flex flex-col gap-3 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex items-start justify-between gap-4">
            <div>
              <dt className="font-medium">{r.label}</dt>
              <dd className="text-muted-foreground">{r.value}</dd>
            </div>
            <button
              type="button"
              onClick={() => goTo(r.step)}
              className="text-sm underline underline-offset-4"
              aria-label={`Change ${r.label.toLowerCase()}`}
            >
              Change
            </button>
          </div>
        ))}
      </dl>

      {quote && (
        <p className="flex justify-between border-t border-border pt-4 text-lg font-semibold">
          <span>{payment === 'COD' ? 'Pay on delivery' : 'Total to pay'}</span>
          <span className="tabular-nums">{formatBdt(quote.totals.total)}</span>
        </p>
      )}

      {/* Placing the order is Phase 3 step 18 (stock + order + payment record in one transaction). */}
      <Button size="lg" fullWidth disabled aria-describedby="place-order-note">
        Place order
      </Button>
      <p id="place-order-note" className="text-sm text-muted-foreground">
        Ordering opens in the next update. Nothing has been charged.
      </p>
    </div>
  )
}
