'use client'

import type { CheckoutQuoteView } from '@nowoll/types'
import { useState } from 'react'
import type { CheckoutQuoteState } from '@/hooks/use-checkout-quote'
import { formatBdt } from '@/lib/format'

function Totals({ quote }: { quote: CheckoutQuoteView }) {
  const t = quote.totals
  return (
    <dl className="flex flex-col gap-2 text-sm">
      <div className="flex justify-between">
        <dt>Subtotal</dt>
        <dd className="tabular-nums">{formatBdt(t.subtotal)}</dd>
      </div>
      {quote.discount && (
        <div className="flex justify-between text-success">
          <dt>Discount ({quote.discount.code})</dt>
          <dd className="tabular-nums">−{formatBdt(quote.discount.amount)}</dd>
        </div>
      )}
      <div className="flex justify-between">
        <dt>Delivery{quote.shipping ? ` (${quote.shipping.name})` : ''}</dt>
        <dd className="tabular-nums">
          {!quote.shipping
            ? 'After you add your address'
            : t.freeShipping
              ? 'Free'
              : formatBdt(t.shippingFee)}
        </dd>
      </div>
      {/* Decision #1: VAT is added on top; with a 0% rate there's no line at all */}
      {Number(t.vatRate) > 0 && (
        <div className="flex justify-between">
          <dt>VAT ({Number(t.vatRate)}%)</dt>
          <dd className="tabular-nums">{formatBdt(t.vatAmount)}</dd>
        </div>
      )}
      <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
        <dt>Total</dt>
        <dd className="tabular-nums">{formatBdt(t.total)}</dd>
      </div>
    </dl>
  )
}

export function OrderSummary({ state }: { state: CheckoutQuoteState }) {
  const [openOnPhone, setOpenOnPhone] = useState(false)
  const { quote, loading } = state

  const body = quote ? (
    <div className="flex flex-col gap-4" aria-busy={loading}>
      <ul className="flex flex-col gap-2 text-sm">
        {quote.lines.map((l) => (
          <li key={l.variantId} className="flex justify-between gap-3">
            <span>
              {l.productName}{' '}
              <span className="text-muted-foreground">
                ({l.variantLabel}) × {l.quantity}
              </span>
            </span>
            <span className="tabular-nums">{formatBdt(l.lineTotal)}</span>
          </li>
        ))}
      </ul>
      {quote.discountProblem && (
        <p role="status" className="text-sm text-warning">
          Your code wasn&apos;t applied: {quote.discountProblem.message}
        </p>
      )}
      <Totals quote={quote} />
    </div>
  ) : (
    <p className="text-sm text-muted-foreground">Calculating…</p>
  )

  return (
    <aside aria-label="Order summary" className="rounded-control border border-border p-5">
      {/* Phones: collapsed behind a button showing the total, so the form stays in view. */}
      <button
        type="button"
        onClick={() => setOpenOnPhone((o) => !o)}
        aria-expanded={openOnPhone}
        aria-controls="order-summary-body"
        className="flex w-full items-center justify-between text-left font-medium md:hidden"
      >
        <span>{openOnPhone ? 'Hide' : 'Show'} order summary</span>
        <span className="tabular-nums">{quote ? formatBdt(quote.totals.total) : '…'}</span>
      </button>
      <h2 className="hidden text-lg font-semibold md:block">Order summary</h2>
      <div
        id="order-summary-body"
        className={`${openOnPhone ? 'mt-4 block' : 'hidden'} md:mt-4 md:block`}
      >
        {body}
      </div>
    </aside>
  )
}
