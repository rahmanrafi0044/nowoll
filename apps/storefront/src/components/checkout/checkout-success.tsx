'use client'

import type { OrderReceiptView } from '@nowoll/types'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { ReceiptDetails } from '@/components/orders/receipt-details'
import { fetchReceipt } from '@/lib/cart-api'
import { formatBdt } from '@/lib/format'
import { useCheckoutStore } from '@/stores/checkout-store'
import { OrderNotFound, PaymentConfirmation } from './payment-confirmation'

/**
 * The order confirmation page (step 21) — the same page for cash on delivery
 * and online payment. Online orders get the live payment status on top
 * ("Confirming… → Paid ✓"); both get the full receipt below.
 */
export function CheckoutSuccess({ orderId }: { orderId: string | null }) {
  const [receipt, setReceipt] = useState<OrderReceiptView | null>(null)
  const [problem, setProblem] = useState<'NOT_FOUND' | string | null>(null)

  useEffect(() => {
    if (!orderId) return
    let cancelled = false
    void fetchReceipt(orderId).then((result) => {
      if (cancelled) return
      if (result.ok) setReceipt(result.data)
      else setProblem(result.status === 404 || result.status === 400 ? 'NOT_FOUND' : result.message)
    })
    return () => {
      cancelled = true
    }
  }, [orderId])

  if (!orderId || problem === 'NOT_FOUND') return <OrderNotFound />
  if (problem)
    return (
      <p role="alert" className="text-center text-danger">
        {problem}
      </p>
    )
  if (!receipt) return <p className="text-center text-muted-foreground">Loading your order…</p>

  return (
    <div className="flex flex-col gap-10">
      {receipt.paymentMethod === 'SSLCOMMERZ' ? (
        <PaymentConfirmation orderId={receipt.orderId} />
      ) : (
        <CashOnDeliveryPlaced receipt={receipt} />
      )}
      <ReceiptDetails receipt={receipt} />
    </div>
  )
}

function CashOnDeliveryPlaced({ receipt }: { receipt: OrderReceiptView }) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    headingRef.current?.focus() // announce it to screen readers
    useCheckoutStore.getState().reset() // this checkout is finished
  }, [])
  const cancelled = receipt.status === 'CANCELLED'

  return (
    <section
      aria-labelledby="placed-heading"
      className="flex flex-col items-center gap-3 text-center"
    >
      <h1
        id="placed-heading"
        ref={headingRef}
        tabIndex={-1}
        className="text-2xl font-semibold outline-none"
      >
        {cancelled ? 'This order was cancelled' : 'Thank you — your order is placed!'}
      </h1>
      <p className="text-lg">
        Order number <strong>{receipt.displayNumber}</strong>
      </p>
      {!cancelled && (
        <p className="text-muted-foreground">
          We&apos;ll call you shortly to confirm. Please pay{' '}
          <strong>{formatBdt(receipt.total)}</strong> in cash when your parcel arrives.
        </p>
      )}
      <Link href="/shop" className="font-medium underline underline-offset-4">
        Continue shopping
      </Link>
    </section>
  )
}
