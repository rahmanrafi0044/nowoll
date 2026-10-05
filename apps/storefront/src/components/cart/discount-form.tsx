'use client'

import { Button, Input } from '@nowoll/ui'
import { type FormEvent, useState } from 'react'
import type { DiscountState } from '@/hooks/use-cart-quote'
import { fetchDiscountPreview } from '@/lib/cart-api'
import { useCartStore } from '@/stores/cart-store'

export function DiscountForm({ discount }: { discount: DiscountState }) {
  const items = useCartStore((s) => s.items)
  const discountCode = useCartStore((s) => s.discountCode)
  const setDiscountCode = useCartStore((s) => s.setDiscountCode)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  async function apply(event: FormEvent) {
    event.preventDefault()
    const trimmed = code.trim()
    if (!trimmed) return
    setBusy(true)
    setError(undefined)
    const result = await fetchDiscountPreview(
      trimmed,
      items.map(({ variantId, quantity }) => ({ variantId, quantity })),
    )
    setBusy(false)
    if (result.ok) {
      setDiscountCode(result.data.code) // the hook re-checks it whenever the bag changes
      setCode('')
    } else {
      setError(result.status === 429 ? 'Too many tries — please wait a minute.' : result.message)
    }
  }

  if (discountCode) {
    return (
      <div className="flex flex-col gap-1 text-sm">
        <div className="flex items-center justify-between">
          <span>
            Code <strong>{discountCode}</strong>
            {discount.state === 'applied' && ' applied'}
          </span>
          <button
            type="button"
            onClick={() => setDiscountCode(null)}
            className="underline underline-offset-4"
            aria-label={`Remove code ${discountCode}`}
          >
            Remove
          </button>
        </div>
        {(discount.state === 'refused' || discount.state === 'waiting') && (
          <p role="status" className="text-warning">
            {discount.message}
          </p>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={apply} className="flex items-start gap-2">
      <div className="flex-1">
        <Input
          label="Discount code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoCapitalize="characters"
          autoComplete="off"
          error={error}
        />
      </div>
      <Button type="submit" variant="secondary" className="mt-7" disabled={busy || !code.trim()}>
        {busy ? 'Checking…' : 'Apply'}
      </Button>
    </form>
  )
}
