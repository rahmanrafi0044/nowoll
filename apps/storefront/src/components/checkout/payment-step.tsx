'use client'

import { Button } from '@nowoll/ui'
import { useState } from 'react'
import { type PaymentChoice, useCheckoutStore } from '@/stores/checkout-store'

const OPTIONS: { value: PaymentChoice; title: string; detail: string; available: boolean }[] = [
  {
    // Step 18 decision #6: switched on together with SSLCommerz in steps 19–20.
    value: 'SSLCOMMERZ',
    title: 'Pay online',
    detail: 'Card, bKash, Nagad or Rocket — coming soon',
    available: false,
  },
  {
    value: 'COD',
    title: 'Cash on delivery',
    detail: 'Pay the courier when your parcel arrives',
    available: true,
  },
]

const isAvailable = (p: PaymentChoice | null) => OPTIONS.some((o) => o.value === p && o.available)

export const paymentLabel = (p: PaymentChoice) => OPTIONS.find((o) => o.value === p)!.title

export function PaymentStep() {
  const saved = useCheckoutStore((s) => s.payment)
  const setPayment = useCheckoutStore((s) => s.setPayment)
  const complete = useCheckoutStore((s) => s.complete)
  const [choice, setChoice] = useState<PaymentChoice | null>(isAvailable(saved) ? saved : null)
  const [error, setError] = useState(false)

  return (
    <div className="flex flex-col gap-4">
      <fieldset aria-describedby={error ? 'payment-error' : undefined}>
        <legend className="sr-only">Payment method</legend>
        <div className="flex flex-col gap-3">
          {OPTIONS.map((o) => (
            <label
              key={o.value}
              className={`flex items-start gap-3 rounded-control border border-border-strong p-4 has-[:checked]:border-brand ${o.available ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
            >
              <input
                type="radio"
                name="payment"
                value={o.value}
                checked={choice === o.value}
                disabled={!o.available}
                onChange={() => setChoice(o.value)}
                className="mt-1 size-4 accent-brand"
              />
              <span>
                <span className="block font-medium">{o.title}</span>
                <span className="block text-sm text-muted-foreground">{o.detail}</span>
              </span>
            </label>
          ))}
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
          if (!choice) return setError(true)
          setPayment(choice)
          complete('payment')
        }}
      >
        Review order
      </Button>
    </div>
  )
}
