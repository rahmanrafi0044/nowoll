'use client'

import Link from 'next/link'
import type { CartQuoteState } from '@/hooks/use-cart-quote'
import { formatBdt } from '@/lib/format'
import type { FreeDeliveryOffer } from '@/lib/free-delivery'
import { FreeDeliveryBar } from './free-delivery-bar'

// Subtotal → discount → "Shipping & VAT at checkout" → estimated total (decision #5).
export function CartSummary({
  summary,
  onNavigate,
  showViewBag = false,
  freeDelivery = null,
}: {
  summary: CartQuoteState
  onNavigate?: () => void
  showViewBag?: boolean
  /** Admin → Shipping's free-delivery amount (38f bar); null = no bar. */
  freeDelivery?: FreeDeliveryOffer | null
}) {
  const { quote, loading, discount } = summary
  const subtotal = Number(quote?.subtotal ?? 0)
  const discountAmount = discount.state === 'applied' ? Number(discount.preview.discountAmount) : 0
  const canCheckout = !loading && quote !== null && quote.canCheckout && quote.lines.length > 0

  return (
    <div className="flex flex-col gap-3">
      {freeDelivery && quote && (
        <FreeDeliveryBar offer={freeDelivery} amount={subtotal - discountAmount} />
      )}
      <dl className="flex flex-col gap-2 text-sm">
        <div className="flex justify-between">
          <dt>Subtotal</dt>
          <dd className="tabular-nums">{loading && !quote ? '…' : formatBdt(subtotal)}</dd>
        </div>
        {discount.state === 'applied' && (
          <div className="flex justify-between text-success">
            <dt>Discount ({discount.preview.code})</dt>
            <dd className="tabular-nums">−{formatBdt(discountAmount)}</dd>
          </div>
        )}
        <div className="flex justify-between text-muted-foreground">
          <dt>Shipping &amp; VAT</dt>
          <dd>Calculated at checkout</dd>
        </div>
        <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
          <dt>Estimated total</dt>
          <dd className="tabular-nums">{formatBdt(subtotal - discountAmount)}</dd>
        </div>
      </dl>

      {quote && !quote.canCheckout && (
        <p role="alert" className="text-sm text-danger">
          Some items need your attention before checkout.
        </p>
      )}

      {canCheckout ? (
        <Link
          href="/checkout"
          onClick={onNavigate}
          className="flex h-12 items-center justify-center rounded-control bg-brand text-base font-medium text-brand-foreground hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Checkout
        </Link>
      ) : (
        <span
          aria-disabled="true"
          className="flex h-12 items-center justify-center rounded-control bg-brand text-base font-medium text-brand-foreground opacity-50"
        >
          Checkout
        </span>
      )}
      {showViewBag && (
        <Link
          href="/cart"
          onClick={onNavigate}
          className="text-center text-sm underline underline-offset-4"
        >
          View bag
        </Link>
      )}
    </div>
  )
}
