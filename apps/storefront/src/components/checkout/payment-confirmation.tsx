'use client'

import { Button } from '@nowoll/ui'
import Link from 'next/link'
import { useEffect } from 'react'
import { usePaymentStatus } from '@/hooks/use-payment-status'
import { formatBdt } from '@/lib/format'
import { useCheckoutStore } from '@/stores/checkout-store'

const linkClass = 'font-medium underline underline-offset-4'

/** The thank-you page after SSLCommerz: "Confirming…" until the API says paid (or under review). */
export function PaymentConfirmation({
  orderId,
  onPaid,
}: {
  orderId: string | null
  /** Called once the payment is confirmed (the purchase is reported then). */
  onPaid?: () => void
}) {
  const { view, notFound, error, gaveUp, loading, checkAgain } = usePaymentStatus(orderId, true)
  const paid = view?.paymentStatus === 'PAID'

  // Paid: this checkout is finished — don't offer "Pay now" for it again.
  useEffect(() => {
    if (paid) useCheckoutStore.getState().reset()
  }, [paid])
  // (onPaid may run again on a re-render — the purchase is reported once anyway.)
  useEffect(() => {
    if (paid) onPaid?.()
  }, [paid, onPaid])

  if (!orderId || notFound) return <OrderNotFound />

  return (
    <section
      aria-labelledby="payment-heading"
      className="flex flex-col items-center gap-4 text-center"
    >
      {paid ? (
        <>
          <h1 id="payment-heading" className="text-2xl font-semibold">
            Payment received ✓
          </h1>
          <p className="text-lg">
            Order <strong>{view.displayNumber}</strong> is confirmed.
          </p>
          <p className="text-muted-foreground">
            You paid {formatBdt(view.total)}. We&apos;ll let you know when it&apos;s on its way.
          </p>
          <p className="text-sm text-muted-foreground">
            Keep your order number — you&apos;ll need it to track your order.
          </p>
          <Link href="/shop" className={linkClass}>
            Continue shopping
          </Link>
        </>
      ) : view?.paymentStatus === 'UNDER_REVIEW' ? (
        <>
          <h1 id="payment-heading" className="text-2xl font-semibold">
            We&apos;ve received your payment
          </h1>
          <p>
            We&apos;re making a few quick checks on order <strong>{view.displayNumber}</strong> and
            will contact you shortly. <strong>Please don&apos;t pay again.</strong>
          </p>
          <Link href="/shop" className={linkClass}>
            Continue shopping
          </Link>
        </>
      ) : view && view.status === 'CANCELLED' ? (
        <>
          <h1 id="payment-heading" className="text-2xl font-semibold">
            This order was cancelled
          </h1>
          <p>
            Order <strong>{view.displayNumber}</strong> wasn&apos;t paid in time. If money was taken
            from your account, don&apos;t worry — we&apos;ll sort it out and refund it.
          </p>
          <Link href="/shop" className={linkClass}>
            Continue shopping
          </Link>
        </>
      ) : (
        <>
          <h1 id="payment-heading" className="text-2xl font-semibold">
            Confirming your payment…
          </h1>
          <p role="status" className="text-muted-foreground">
            {gaveUp
              ? "The payment service hasn't confirmed yet. If money was taken, there's nothing more to do — your order will be confirmed automatically."
              : loading || !error
                ? 'This usually takes a few seconds. Please keep this page open.'
                : error}
          </p>
          {gaveUp && (
            <Button variant="secondary" onClick={checkAgain}>
              Check again
            </Button>
          )}
          {view?.canRetry && gaveUp && (
            <Link
              href={`/checkout/payment-failed?order=${encodeURIComponent(view.orderId)}&reason=fail`}
              className={linkClass}
            >
              Payment didn&apos;t go through? Try again
            </Link>
          )}
        </>
      )}
    </section>
  )
}

export function OrderNotFound() {
  return (
    <section className="flex flex-col items-center gap-4 text-center">
      <h1 className="text-2xl font-semibold">We couldn&apos;t find that order</h1>
      <p className="text-muted-foreground">
        Please check the link, or contact us with your order number.
      </p>
      <Link href="/shop" className={linkClass}>
        Continue shopping
      </Link>
    </section>
  )
}
