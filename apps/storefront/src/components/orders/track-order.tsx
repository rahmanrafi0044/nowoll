'use client'

import type { OrderTrackingView } from '@nowoll/types'
import { Button, Input } from '@nowoll/ui'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { PayNow } from '@/components/checkout/pay-now'
import { trackOrder } from '@/lib/cart-api'
import { formatBdt } from '@/lib/format'
import { OrderLines } from './order-lines'
import { formatDate, JOURNEY, paymentText, STATUS_LABEL } from './order-status'

/** The "Track your order" form, then the result. */
export function TrackOrder() {
  const [form, setForm] = useState({ orderNumber: '', contact: '' })
  const [errors, setErrors] = useState<{ orderNumber?: string; contact?: string }>({})
  const [sending, setSending] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [order, setOrder] = useState<OrderTrackingView | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const missing = {
      ...(!form.orderNumber.trim() && { orderNumber: 'Enter your order number, e.g. NW-10001' }),
      ...(!form.contact.trim() && {
        contact: 'Enter the email or mobile number you used at checkout',
      }),
    }
    setErrors(missing)
    if (Object.keys(missing).length > 0) return
    setSending(true)
    setProblem(null)
    const result = await trackOrder(form)
    setSending(false)
    if (result.ok) return setOrder(result.data)
    setProblem(
      result.status === 429
        ? 'Too many tries — please wait a minute and try again.'
        : result.message || 'Something went wrong. Please try again.',
    )
  }

  if (order)
    return (
      <TrackingResult
        order={order}
        onAnother={() => {
          setOrder(null)
          setForm({ orderNumber: '', contact: '' })
        }}
      />
    )

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Input
        label="Order number"
        placeholder="NW-10001"
        autoComplete="off"
        value={form.orderNumber}
        onChange={(e) => setForm({ ...form, orderNumber: e.target.value })}
        error={errors.orderNumber}
      />
      <Input
        label="Email or mobile number"
        hint="The one you used at checkout"
        autoComplete="email"
        value={form.contact}
        onChange={(e) => setForm({ ...form, contact: e.target.value })}
        error={errors.contact}
      />
      {problem && (
        <p role="alert" className="rounded-control bg-danger-soft p-3 text-sm text-danger">
          {problem}
        </p>
      )}
      <Button type="submit" size="lg" disabled={sending}>
        {sending ? 'Looking up your order…' : 'Track order'}
      </Button>
    </form>
  )
}

function TrackingResult({ order, onAnother }: { order: OrderTrackingView; onAnother: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => headingRef.current?.focus(), []) // announce the result to screen readers
  const reachedAt = new Map(order.timeline.map((t) => [t.status, t.at]))
  const ended = order.status === 'CANCELLED' || order.status === 'RETURNED'
  const current = JOURNEY.indexOf(order.status)
  const area = [order.deliveryArea.area, order.deliveryArea.district, order.deliveryArea.division]
    .filter(Boolean)
    .join(', ')

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h2 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold outline-none">
          Order {order.displayNumber}
        </h2>
        <p className="text-sm text-muted-foreground">Placed {formatDate(order.placedAt)}</p>
      </header>

      {ended ? (
        <p role="status" className="rounded-control bg-surface-muted p-4">
          <strong>{STATUS_LABEL[order.status]}</strong>
          {reachedAt.get(order.status) && ` on ${formatDate(reachedAt.get(order.status)!)}`}.
          {order.status === 'CANCELLED' &&
            ' If you paid and money was taken, it will be refunded — contact us with your order number.'}
        </p>
      ) : (
        <ol aria-label="Order progress" className="flex flex-col gap-3">
          {JOURNEY.map((status, i) => {
            const done = i <= current
            return (
              <li
                key={status}
                aria-current={i === current ? 'step' : undefined}
                className="flex items-center gap-3"
              >
                <span
                  aria-hidden
                  className={`flex size-6 items-center justify-center rounded-full text-xs ${done ? 'bg-brand text-brand-foreground' : 'border border-border-strong'}`}
                >
                  {done ? '✓' : ''}
                </span>
                <span className={done ? 'font-medium' : 'text-muted-foreground'}>
                  {STATUS_LABEL[status]}
                  <span className="sr-only">{done ? ' (done)' : ' (not yet)'}</span>
                </span>
                {reachedAt.get(status) && (
                  <span className="ml-auto text-sm text-muted-foreground">
                    {formatDate(reachedAt.get(status)!)}
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      )}

      {order.trackingNumber && (
        <p className="rounded-control border border-border p-4 text-sm">
          Sent with <strong>{order.courierName ?? 'our courier'}</strong> — tracking number{' '}
          <strong className="font-mono">{order.trackingNumber}</strong>
        </p>
      )}

      {order.canPay && order.payOrderId && (
        <div className="flex flex-col gap-2">
          <p className="text-sm">
            This order isn&apos;t paid yet — your items are held for a short while.
          </p>
          <PayNow orderId={order.payOrderId} total={order.total} />
        </div>
      )}

      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-semibold">Delivering to</dt>
          <dd className="text-muted-foreground">{area}</dd>
        </div>
        <div>
          <dt className="font-semibold">Payment</dt>
          <dd className="text-muted-foreground">
            {paymentText(order.paymentMethod, order.paymentStatus, order.total, formatBdt)}
          </dd>
        </div>
      </dl>

      <section aria-labelledby="tracked-items" className="flex flex-col gap-3">
        <h3 id="tracked-items" className="font-semibold">
          Items
        </h3>
        <OrderLines items={order.items} />
        <p className="flex justify-between border-t border-border pt-3 font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{formatBdt(order.total)}</span>
        </p>
      </section>

      <Button variant="secondary" onClick={onAnother}>
        Track another order
      </Button>
    </div>
  )
}
