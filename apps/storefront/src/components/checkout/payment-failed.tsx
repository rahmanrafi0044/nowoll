'use client'

import Link from 'next/link'
import { usePaymentStatus } from '@/hooks/use-payment-status'
import { OrderNotFound } from './payment-confirmation'
import { PayNow } from './pay-now'

const linkClass = 'font-medium underline underline-offset-4'

/** After a failed or cancelled payment: try again while the order is still held (decision #2). */
export function PaymentFailed({
  orderId,
  reason,
}: {
  orderId: string | null
  reason: 'fail' | 'cancel'
}) {
  const { view, notFound, error, loading } = usePaymentStatus(orderId, false)
  if (!orderId || notFound) return <OrderNotFound />

  const heading = reason === 'cancel' ? 'Payment cancelled' : "Your payment didn't go through"
  const successLink = view && (
    <Link
      href={`/checkout/success?order=${encodeURIComponent(view.orderId)}`}
      className={linkClass}
    >
      See your order status
    </Link>
  )

  return (
    <section
      aria-labelledby="payment-heading"
      className="flex flex-col items-center gap-4 text-center"
    >
      <h1 id="payment-heading" className="text-2xl font-semibold">
        {view?.paymentStatus === 'PAID' ? 'Good news — your payment went through' : heading}
      </h1>
      {loading && <p className="text-muted-foreground">Checking your order…</p>}
      {error && !view && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {view &&
        (view.paymentStatus === 'PAID' ? (
          <>
            <p>
              Order <strong>{view.displayNumber}</strong> is paid and confirmed.
            </p>
            {successLink}
          </>
        ) : view.paymentStatus === 'UNDER_REVIEW' ? (
          <>
            <p>
              We&apos;ve received a payment for order <strong>{view.displayNumber}</strong> and are
              checking it. <strong>Please don&apos;t pay again.</strong>
            </p>
            {successLink}
          </>
        ) : view.canRetry ? (
          <>
            <p className="text-muted-foreground">
              Order <strong>{view.displayNumber}</strong> is still reserved for you. You can try
              again — with the same or another card or wallet.
            </p>
            <PayNow orderId={view.orderId} total={view.total} label="Try paying again" />
          </>
        ) : (
          <>
            <p>
              Order <strong>{view.displayNumber}</strong> has expired because it wasn&apos;t paid in
              time, and its items went back on sale. Please place a new order.
            </p>
            <Link href="/shop" className={linkClass}>
              Continue shopping
            </Link>
          </>
        ))}
    </section>
  )
}
