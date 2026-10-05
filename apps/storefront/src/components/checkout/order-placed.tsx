'use client'

import type { OrderPlacedView } from '@nowoll/types'
import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { formatBdt } from '@/lib/format'

// Shown right after a successful order. (The full confirmation page with the
// order details and tracking link arrives in step 21.)
export function OrderPlaced({ order }: { order: OrderPlacedView }) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => headingRef.current?.focus(), []) // announce it to screen readers

  return (
    <section
      aria-labelledby="order-placed"
      className="mx-auto flex max-w-lg flex-col items-center gap-4 py-12 text-center"
    >
      <h2
        id="order-placed"
        ref={headingRef}
        tabIndex={-1}
        className="text-2xl font-semibold outline-none"
      >
        Thank you — your order is placed!
      </h2>
      <p className="text-lg">
        Order number <strong>{order.displayNumber}</strong>
      </p>
      {order.paymentMethod === 'COD' ? (
        <p className="text-muted-foreground">
          We&apos;ll call you shortly to confirm. Please pay{' '}
          <strong>{formatBdt(order.total)}</strong> in cash when your parcel arrives.
        </p>
      ) : (
        <p className="text-muted-foreground">Total {formatBdt(order.total)}.</p>
      )}
      <p className="text-sm text-muted-foreground">
        Keep your order number — you&apos;ll need it to track your order.
      </p>
      <Link
        href="/shop"
        className="mt-2 inline-flex h-11 items-center rounded-control bg-brand px-6 font-medium text-brand-foreground hover:bg-brand-hover"
      >
        Continue shopping
      </Link>
    </section>
  )
}
