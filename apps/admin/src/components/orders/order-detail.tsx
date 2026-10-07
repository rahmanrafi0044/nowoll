'use client'

import type { AdminOrderDetail, AdminOrderStatus } from '@nowoll/types'
import { Badge, Button, Input } from '@nowoll/ui'
import Link from 'next/link'
import { type FormEvent, type ReactNode, useCallback, useState } from 'react'
import { Panel } from '@/components/dashboard/panel'
import { useLoad } from '@/components/dashboard/use-load'
import { FormProblem, TextArea } from '@/components/form-fields'
import { ProductThumb } from '@/components/products/product-thumb'
import { formatInstantDateTime } from '@/lib/date'
import { formatBdt } from '@/lib/format'
import {
  ACTION_LABEL,
  COURIERS,
  ORDER_STATUS,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
} from '@/lib/order-labels'
import {
  changeOrderStatus,
  fetchOrder,
  markCashCollected,
  updateOrderNotes,
  updateTracking,
} from '@/lib/orders-api'

// ============================================================================
// One order (step 31a). The ACTIONS come from the API (`allowedNext`) — the
// page never decides on its own what may happen next. Every change says which
// status this page was showing, so if a colleague changed the order a moment
// ago the API refuses, and the page reloads to show what they did.
// ============================================================================

export function OrderDetail({ id }: { id: string }) {
  const load = useCallback(() => fetchOrder(id), [id])
  const { state, retry, refresh } = useLoad(load)

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/orders"
        className="text-sm text-muted-foreground underline underline-offset-4"
      >
        ← Orders
      </Link>
      <Panel title="Order" state={state} retry={retry}>
        {(order) => (
          <div className="flex flex-col gap-6">
            <header className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold">{order.number}</h1>
              <Badge variant={ORDER_STATUS[order.status].variant}>
                {ORDER_STATUS[order.status].label}
              </Badge>
              <Badge variant={PAYMENT_STATUS[order.paymentStatus].variant}>
                {PAYMENT_STATUS[order.paymentStatus].label}
              </Badge>
              <span className="text-sm text-muted-foreground">
                Placed {formatInstantDateTime(order.createdAt)}
              </span>
              <a
                href={`/admin/orders/${order.id}/invoice`}
                target="_blank"
                rel="noreferrer"
                className="ml-auto text-sm font-medium underline underline-offset-4"
              >
                Invoice ↗
              </a>
            </header>
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="flex flex-col gap-6 lg:col-span-2">
                <Card title="Items">
                  <Items order={order} />
                </Card>
                <Card title="History">
                  <Timeline order={order} />
                </Card>
              </div>
              <div className="flex flex-col gap-6">
                <Card title="Next step">
                  <Actions order={order} onChanged={refresh} />
                </Card>
                <Card title="Customer">
                  <Customer order={order} />
                </Card>
                <Card title="Payment">
                  <Payment order={order} onChanged={refresh} />
                </Card>
                <Card title="Delivery">
                  <Delivery order={order} onChanged={refresh} />
                </Card>
                <Card title="Staff notes">
                  <Notes key={order.adminNotes ?? ''} order={order} onChanged={refresh} />
                </Card>
              </div>
            </div>
          </div>
        )}
      </Panel>
    </div>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="rounded-lg border border-border p-5">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function Items({ order }: { order: AdminOrderDetail }) {
  const t = order.totals
  const row = (label: string, value: string, strong = false) => (
    <div className={`flex justify-between gap-3 ${strong ? 'font-semibold' : ''}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  )
  return (
    <>
      <ul className="flex flex-col divide-y divide-border">
        {order.items.map((i) => (
          <li key={i.id} className="flex items-center gap-3 py-2.5 text-sm">
            <ProductThumb image={i.imageUrl ? { url: i.imageUrl, altText: i.productName } : null} />
            <span className="min-w-0 flex-1">
              <span className="font-medium">{i.productName}</span>
              <span className="block text-xs text-muted-foreground">
                {i.variantLabel} · {i.sku}
              </span>
            </span>
            <span className="text-right tabular-nums">
              {i.quantity} × {formatBdt(i.unitPrice)}
              <span className="block font-medium">{formatBdt(i.lineTotal)}</span>
            </span>
          </li>
        ))}
      </ul>
      <dl className="mt-3 flex flex-col gap-1 border-t border-border pt-3 text-sm">
        {row('Subtotal', formatBdt(t.subtotal))}
        {Number(t.discountAmount) > 0 &&
          row(
            `Discount${t.discountCode ? ` (${t.discountCode})` : ''}`,
            `−${formatBdt(t.discountAmount)}`,
          )}
        {row(`Delivery (${order.address.zoneName})`, formatBdt(t.shippingFee))}
        {Number(t.vatAmount) > 0 && row(`VAT ${Number(t.vatRate)}%`, formatBdt(t.vatAmount))}
        {row('Total', formatBdt(t.total), true)}
      </dl>
      {order.customerNote && (
        <p className="mt-3 rounded-control bg-surface-muted p-3 text-sm">
          <span className="font-medium">Customer’s note:</span> {order.customerNote}
        </p>
      )}
    </>
  )
}

function Timeline({ order }: { order: AdminOrderDetail }) {
  return (
    <ol className="flex flex-col gap-3 text-sm">
      {[...order.timeline].reverse().map((t, i) => (
        <li key={`${t.at}-${i}`} className="flex flex-col">
          <span className="font-medium">
            {t.from === t.to ? t.note : ORDER_STATUS[t.to].label}
            <span className="font-normal text-muted-foreground">
              {' '}
              · {formatInstantDateTime(t.at)}
            </span>
          </span>
          {t.from !== t.to && t.note && <span>{t.note}</span>}
          <span className="text-xs text-muted-foreground">{t.by ?? 'Automatic'}</span>
        </li>
      ))}
    </ol>
  )
}

function Customer({ order }: { order: AdminOrderDetail }) {
  const a = order.address
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{order.customer.name}</span>
      <a href={`tel:${order.customer.phone}`} className="underline underline-offset-4">
        {order.customer.phone}
      </a>
      <a href={`mailto:${order.customer.email}`} className="break-all underline underline-offset-4">
        {order.customer.email}
      </a>
      {order.customer.accountId ? (
        <Link
          href={`/admin/customers/${order.customer.accountId}`}
          className="text-xs underline underline-offset-4"
        >
          View customer account
        </Link>
      ) : (
        <span className="text-xs text-muted-foreground">Guest checkout</span>
      )}
      <address className="mt-2 not-italic">
        {a.line1}
        {a.line2 && <>, {a.line2}</>}
        <br />
        {[a.area, a.district, a.division].filter(Boolean).join(', ')}
        {a.postalCode && ` ${a.postalCode}`}
      </address>
    </div>
  )
}

/** The buttons for the next status, each opening its own small form. */
function Actions({ order, onChanged }: { order: AdminOrderDetail; onChanged: () => void }) {
  const [acting, setActing] = useState<AdminOrderStatus | null>(null)
  // e.g. "changed by someone else" — kept after the form closes and the order reloads.
  const [notice, setNotice] = useState<string | null>(null)
  const finish = (message: string | null) => {
    setActing(null)
    setNotice(message)
    onChanged()
  }
  if (acting)
    return <ActionForm order={order} to={acting} onDone={finish} onCancel={() => setActing(null)} />
  if (order.allowedNext.length === 0)
    return (
      <div className="flex flex-col gap-2">
        <FormProblem message={notice} />
        <p className="text-sm text-muted-foreground">
          {order.status === 'CANCELLED'
            ? `Cancelled${order.cancelReason ? `: ${order.cancelReason}` : '.'}`
            : order.status === 'DELIVERED'
              ? 'Delivered — nothing more to do. Returns are handled on the Returns page.'
              : 'Nothing more to do.'}
        </p>
      </div>
    )
  return (
    <div className="flex flex-col gap-2">
      <FormProblem message={notice} />
      {order.status === 'PENDING' && order.paymentMethod === 'SSLCOMMERZ' && (
        <p className="text-sm text-muted-foreground">
          Waiting for the online payment — it confirms itself when SSLCommerz does.
        </p>
      )}
      {order.allowedNext.map((to) => (
        <Button
          key={to}
          variant={to === 'CANCELLED' ? 'ghost' : 'primary'}
          onClick={() => setActing(to)}
        >
          {ACTION_LABEL[to] ?? to}
        </Button>
      ))}
    </div>
  )
}

function ActionForm({
  order,
  to,
  onDone,
  onCancel,
}: {
  order: AdminOrderDetail
  to: AdminOrderStatus
  /** null = done; a message = refused because the order changed meanwhile (shown after reload). */
  onDone: (message: string | null) => void
  onCancel: () => void
}) {
  const codUnpaid = order.paymentMethod === 'COD' && order.paymentStatus === 'PENDING'
  const [note, setNote] = useState('')
  const [courierName, setCourierName] = useState(order.courierName ?? '')
  const [trackingNumber, setTrackingNumber] = useState(order.trackingNumber ?? '')
  const [cashCollected, setCashCollected] = useState(true)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (to === 'CANCELLED' && !note.trim())
      return setProblem('Give a reason for cancelling — the customer may ask.')
    if (to === 'SHIPPED' && (!courierName.trim() || !trackingNumber.trim()))
      return setProblem('Enter the courier and the tracking number.')
    setBusy(true)
    setProblem(null)
    const r = await changeOrderStatus(order.id, {
      from: order.status,
      to,
      ...(note.trim() && { note: note.trim() }),
      ...(to === 'SHIPPED' && {
        courierName: courierName.trim(),
        trackingNumber: trackingNumber.trim(),
      }),
      ...(to === 'DELIVERED' && codUnpaid && { cashCollected }),
    })
    setBusy(false)
    if (r.ok) return onDone(null)
    // A colleague changed it: close this form and reload to show what they did.
    if (r.error === 'ORDER_CHANGED') return onDone(r.message)
    setProblem(r.message)
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <p className="text-sm font-medium">{ACTION_LABEL[to]}</p>
      {to === 'SHIPPED' && (
        <>
          <Input
            label="Courier"
            list="couriers"
            value={courierName}
            onChange={(e) => setCourierName(e.target.value)}
            hint="Booked in the courier’s own app first."
          />
          <datalist id="couriers">
            {COURIERS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <Input
            label="Tracking number"
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            The customer gets the “shipped” email with these.
          </p>
        </>
      )}
      {to === 'DELIVERED' && (
        <>
          {codUnpaid && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={cashCollected}
                onChange={(e) => setCashCollected(e.target.checked)}
              />
              Cash collected ({formatBdt(order.totals.total)}) — marks it paid
            </label>
          )}
          <p className="text-xs text-muted-foreground">
            The customer gets the “delivered” email; the return window starts today.
          </p>
        </>
      )}
      {to === 'CANCELLED' && (
        <p className="text-sm text-warning">
          The items go back on sale and any discount code can be used again. This can’t be undone.
        </p>
      )}
      <TextArea
        label={to === 'CANCELLED' ? 'Reason' : 'Note (optional)'}
        value={note}
        maxLength={500}
        rows={2}
        onChange={(e) => setNote(e.target.value)}
        hint={
          to === 'CONFIRMED'
            ? 'e.g. “Called — confirmed, deliver after 5pm”.'
            : 'Shown in the history.'
        }
      />
      <FormProblem message={problem} />
      <div className="flex gap-2">
        <Button type="submit" variant={to === 'CANCELLED' ? 'danger' : 'primary'} disabled={busy}>
          {busy ? 'Saving…' : ACTION_LABEL[to]}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Back
        </Button>
      </div>
    </form>
  )
}

function Payment({ order, onChanged }: { order: AdminOrderDetail; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-2 text-sm">
      <span>{PAYMENT_METHOD[order.paymentMethod]}</span>
      {order.payments.map((p) => (
        <div key={p.id} className="text-xs text-muted-foreground">
          {PAYMENT_STATUS[p.status].label} · {formatBdt(p.amount)} · {p.transactionId}
          {p.bankTransactionId && ` · bank ${p.bankTransactionId}`}
          {p.paidAt && ` · paid ${formatInstantDateTime(p.paidAt)}`}
        </div>
      ))}
      {order.paymentStatus === 'UNDER_REVIEW' && (
        <p className="text-danger">
          SSLCommerz couldn’t be asked about this payment — check it in the SSLCommerz panel.
        </p>
      )}
      {order.canMarkCashCollected && (
        <Button
          variant="secondary"
          size="sm"
          className="self-start"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setProblem(null)
            const r = await markCashCollected(order.id)
            setBusy(false)
            if (!r.ok) return setProblem(r.message)
            onChanged()
          }}
        >
          Mark cash collected
        </Button>
      )}
      <FormProblem message={problem} />
    </div>
  )
}

function Delivery({ order, onChanged }: { order: AdminOrderDetail; onChanged: () => void }) {
  const [editing, setEditing] = useState(false)
  const [courierName, setCourierName] = useState(order.courierName ?? '')
  const [trackingNumber, setTrackingNumber] = useState(order.trackingNumber ?? '')
  const [problem, setProblem] = useState<string | null>(null)
  const shipped = order.status === 'SHIPPED' || order.status === 'DELIVERED'

  if (!order.trackingNumber)
    return (
      <p className="text-sm text-muted-foreground">
        Not shipped yet. The courier and tracking number are entered when you mark it shipped.
      </p>
    )
  if (!editing)
    return (
      <div className="flex flex-col gap-2 text-sm">
        <span>
          {order.courierName} · <span className="font-medium">{order.trackingNumber}</span>
        </span>
        {shipped && (
          <Button variant="ghost" size="sm" className="self-start" onClick={() => setEditing(true)}>
            Correct…
          </Button>
        )}
      </div>
    )
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!courierName.trim() || !trackingNumber.trim())
          return setProblem('Enter both the courier and the tracking number.')
        const r = await updateTracking(order.id, {
          courierName: courierName.trim(),
          trackingNumber: trackingNumber.trim(),
        })
        if (!r.ok) return setProblem(r.message)
        setEditing(false)
        onChanged()
      }}
    >
      <Input
        label="Courier"
        list="couriers-fix"
        value={courierName}
        onChange={(e) => setCourierName(e.target.value)}
      />
      <datalist id="couriers-fix">
        {COURIERS.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <Input
        label="Tracking number"
        value={trackingNumber}
        onChange={(e) => setTrackingNumber(e.target.value)}
      />
      <p className="text-xs text-muted-foreground">A correction doesn’t send another email.</p>
      <FormProblem message={problem} />
      <div className="flex gap-2">
        <Button type="submit" size="sm">
          Save
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

function Notes({ order, onChanged }: { order: AdminOrderDetail; onChanged: () => void }) {
  const [text, setText] = useState(order.adminNotes ?? '')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const dirty = text.trim() !== (order.adminNotes ?? '')
  return (
    <form
      noValidate
      className="flex flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        setProblem(null)
        const r = await updateOrderNotes(order.id, text.trim() || null)
        setBusy(false)
        if (!r.ok) return setProblem(r.message)
        onChanged()
      }}
    >
      <TextArea
        label="Notes"
        value={text}
        maxLength={5000}
        rows={3}
        onChange={(e) => setText(e.target.value)}
        hint="Only staff see these — never the customer."
      />
      <FormProblem message={problem} />
      {dirty && (
        <Button type="submit" size="sm" className="self-start" disabled={busy}>
          {busy ? 'Saving…' : 'Save notes'}
        </Button>
      )}
    </form>
  )
}
