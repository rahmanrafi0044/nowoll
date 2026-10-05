'use client'

import { Button } from '@nowoll/ui'
import Link from 'next/link'
import { usePayNow } from '@/hooks/use-pay-now'
import { formatBdt } from '@/lib/format'

/**
 * "Pay now" / "Try paying again" for an unpaid online order. Every press asks
 * the API for a fresh SSLCommerz page (a new attempt), so it's always safe to press.
 */
export function PayNow({
  orderId,
  total,
  label = 'Pay now',
  notice = null,
}: {
  orderId: string
  total: string
  label?: string
  notice?: string | null
}) {
  const { status, code, message, payNow } = usePayNow(notice)

  // Nothing left to pay here: show why, and where to go instead.
  if (code === 'ALREADY_PAID' || code === 'PAYMENT_UNDER_REVIEW') {
    return (
      <p role="status" className="text-sm">
        {message}{' '}
        <Link
          href={`/checkout/success?order=${encodeURIComponent(orderId)}`}
          className="font-medium underline underline-offset-4"
        >
          See your order status
        </Link>
      </p>
    )
  }
  if (code === 'ORDER_EXPIRED') {
    return (
      <div role="alert" className="flex flex-col gap-2 text-sm">
        <p>{message}</p>
        <Link href="/shop" className="font-medium underline underline-offset-4">
          Continue shopping
        </Link>
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col gap-3">
      {status === 'error' && message && (
        <p role="alert" className="rounded-control bg-danger-soft p-3 text-sm text-danger">
          {message}
        </p>
      )}
      <Button size="lg" fullWidth onClick={() => payNow(orderId)} disabled={status === 'starting'}>
        {status === 'starting' ? 'Opening the payment page…' : `${label} — ${formatBdt(total)}`}
      </Button>
      <p className="text-xs text-muted-foreground">
        Card, bKash, Nagad or Rocket — on SSLCommerz&apos;s secure page.
      </p>
    </div>
  )
}
