'use client'

import Link from 'next/link'
import { PayNow } from '@/components/checkout/pay-now'
import { OrderProgress } from '@/components/orders/order-progress'
import { STATUS_LABEL, formatDate } from '@/components/orders/order-status'
import { ReceiptDetails } from '@/components/orders/receipt-details'
import { useAccountData } from '@/hooks/use-account-data'
import { fetchMyOrder } from '@/lib/account-api'

/** /account/orders/NW-10001 — progress, courier, "Pay now" if unpaid, and the full receipt. */
export function MyOrder({ number }: { number: string }) {
  const { data: order, error } = useAccountData(() => fetchMyOrder(number), [number])

  if (error?.status === 404)
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold">Order not found</h1>
        <Link href="/account/orders" className="font-medium underline underline-offset-4">
          Back to your orders
        </Link>
      </div>
    )
  if (error)
    return (
      <p role="alert" className="text-danger">
        {error.message}
      </p>
    )
  if (!order) return <p className="text-muted-foreground">Loading your order…</p>

  return (
    <div className="flex flex-col gap-8">
      <header>
        <Link href="/account/orders" className="text-sm underline underline-offset-4">
          ← Your orders
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Order {order.displayNumber}</h1>
        <p className="text-sm text-muted-foreground">
          Placed {formatDate(order.placedAt)} · {STATUS_LABEL[order.status]}
        </p>
      </header>
      <OrderProgress status={order.status} timeline={order.timeline} />
      {order.trackingNumber && (
        <p className="rounded-control border border-border p-4 text-sm">
          Sent with <strong>{order.courierName ?? 'our courier'}</strong> — tracking number{' '}
          <strong className="font-mono">{order.trackingNumber}</strong>
        </p>
      )}
      {order.canPay && (
        <div className="flex flex-col gap-2">
          <p className="text-sm">
            This order isn&apos;t paid yet — your items are held for a short while.
          </p>
          <PayNow orderId={order.orderId} total={order.total} />
        </div>
      )}
      <ReceiptDetails receipt={order} />
    </div>
  )
}
