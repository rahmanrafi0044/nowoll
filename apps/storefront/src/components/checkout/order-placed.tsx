'use client'

import type { OrderPlacedView } from '@nowoll/types'
import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { PayNow } from './pay-now'

/**
 * Shown when an online order was placed but the SSLCommerz page couldn't be
 * opened straight away: the order is saved, so the customer can "Pay now".
 * (Every other order goes to the confirmation page, /checkout/success.)
 */
export function OrderPlaced({
  order,
  notice = null,
}: {
  order: OrderPlacedView
  /** Why the payment page didn't open straight after placing the order. */
  notice?: string | null
}) {
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
        Your order is reserved
      </h2>
      <p className="text-lg">
        Order number <strong>{order.displayNumber}</strong>
      </p>
      <p className="text-muted-foreground">
        Complete your payment to confirm it. Your items are held for a short while.
      </p>
      <PayNow orderId={order.orderId} total={order.total} notice={notice} />
      <Link
        href={`/checkout/success?order=${encodeURIComponent(order.orderId)}`}
        className="text-sm font-medium underline underline-offset-4"
      >
        View your order
      </Link>
    </section>
  )
}
