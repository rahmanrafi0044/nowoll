'use client'

import { canPayOnline } from '@nowoll/payments/money'
import { Button } from '@nowoll/ui'
import { useState } from 'react'
import { type PaymentChoice, useCheckoutStore } from '@/stores/checkout-store'

const OPTIONS: { value: PaymentChoice; title: string; detail: string }[] = [
  {
    value: 'SSLCOMMERZ',
    title: 'Pay online',
    detail: 'Card, bKash, Nagad or Rocket — on SSLCommerz’s secure page',
  },
  {
    value: 'COD',
    title: 'Cash on delivery',
    detail: 'Pay the courier when your parcel arrives',
  },
]

export const paymentLabel = (p: PaymentChoice) => OPTIONS.find((o) => o.value === p)!.title

/**
 * Online payment works for totals from ৳10 to ৳5,00,000 (SSLCommerz's limits —
 * the SAME rule the API enforces, from @nowoll/payments). While the total is
 * still loading, both options stay open.
 */
export function PaymentStep({ total }: { total: string | null }) {
  const onlineOk = total === null || canPayOnline(total)
  const isAvailable = (p: PaymentChoice | null) => p === 'COD' || (p === 'SSLCOMMERZ' && onlineOk)
  const saved = useCheckoutStore((s) => s.payment)
  const setPayment = useCheckoutStore((s) => s.setPayment)
  const complete = useCheckoutStore((s) => s.complete)
  const [choice, setChoice] = useState<PaymentChoice | null>(isAvailable(saved) ? saved : null)
  const [error, setError] = useState(false)
  const selected = isAvailable(choice) ? choice : null

  return (
    <div className="flex flex-col gap-4">
      <fieldset aria-describedby={error ? 'payment-error' : undefined}>
        <legend className="sr-only">Payment method</legend>
        <div className="flex flex-col gap-3">
          {OPTIONS.map((o) => {
            const available = isAvailable(o.value)
            return (
              <label
                key={o.value}
                className={`flex items-start gap-3 rounded-control border border-border-strong p-4 has-[:checked]:border-brand ${available ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
              >
                <input
                  type="radio"
                  name="payment"
                  value={o.value}
                  checked={selected === o.value}
                  disabled={!available}
                  onChange={() => setChoice(o.value)}
                  className="mt-1 size-4 accent-brand"
                />
                <span>
                  <span className="block font-medium">{o.title}</span>
                  <span className="block text-sm text-muted-foreground">
                    {available ? o.detail : 'Available for orders from ৳10 to ৳5,00,000'}
                  </span>
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>
      {error && (
        <p id="payment-error" role="alert" className="text-sm text-danger">
          Choose how you&apos;d like to pay.
        </p>
      )}
      <Button
        size="lg"
        onClick={() => {
          if (!selected) return setError(true)
          setPayment(selected)
          complete('payment')
        }}
      >
        Review order
      </Button>
    </div>
  )
}
