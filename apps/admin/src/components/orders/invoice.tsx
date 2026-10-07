'use client'

import type { OrderInvoice } from '@nowoll/types'
import { Button } from '@nowoll/ui'
import Link from 'next/link'
import { useCallback } from 'react'
import { useLoad } from '@/components/dashboard/use-load'
import { formatInstantDate } from '@/lib/date'
import { formatBdt, formatLongDay } from '@/lib/format'
import { PAYMENT_METHOD } from '@/lib/order-labels'
import { fetchInvoice } from '@/lib/orders-api'

// ============================================================================
// The printable invoice (step 31b). Press "Print" → the browser's print
// dialog → "Save as PDF" (or a real printer). Chosen over a server-made PDF:
// the browser draws Bangla names and addresses correctly with the computer's
// own fonts. Everything marked print:hidden stays on screen only.
// ============================================================================

export function Invoice({ id }: { id: string }) {
  const load = useCallback(() => fetchInvoice(id), [id])
  const { state, retry } = useLoad(load)
  if (state.status === 'ok') return <InvoiceSheet invoice={state.data} />
  // (No card around it: the printed A4 page must be the invoice and nothing else.)
  return state.status === 'loading' ? (
    <p className="text-sm text-muted-foreground">Loading…</p>
  ) : (
    <div role="alert" className="flex items-center gap-3 text-sm print:hidden">
      <span className="text-danger">Couldn’t load the invoice. {state.message}</span>
      <Button variant="secondary" size="sm" onClick={retry}>
        Try again
      </Button>
    </div>
  )
}

export function InvoiceSheet({ invoice }: { invoice: OrderInvoice }) {
  const { order: o, store } = invoice
  const t = o.totals
  const a = o.address
  const missingStoreDetails = !store.address || !store.phone || !store.email
  const paid = o.paymentStatus === 'PAID'
  const payment =
    o.paymentMethod === 'COD'
      ? paid
        ? 'Cash on delivery — paid'
        : `Cash on delivery — ${formatBdt(t.total)} to be paid on delivery`
      : paid
        ? 'Paid online (SSLCommerz)'
        : `${PAYMENT_METHOD[o.paymentMethod]} — not paid`

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Button onClick={() => window.print()}>Print / Save as PDF</Button>
        <Link href={`/admin/orders/${o.id}`} className="text-sm underline underline-offset-4">
          Back to the order
        </Link>
        {missingStoreDetails && (
          <p className="w-full text-sm text-warning">
            Your shop’s address, phone or email isn’t set yet, so it’s left off the invoice. It can
            be added on the Settings page (coming in step 38).
          </p>
        )}
      </div>

      <article
        aria-label={`Invoice ${o.number}`}
        className="mx-auto w-full max-w-[210mm] bg-white p-10 text-sm text-[#111] shadow-sm print:max-w-none print:p-0 print:shadow-none"
      >
        <header className="flex flex-wrap justify-between gap-6 border-b border-[#ddd] pb-6">
          <div>
            <p className="text-2xl font-semibold">{store.name}</p>
            {store.tagline && <p className="text-[#555]">{store.tagline}</p>}
            <address className="mt-2 whitespace-pre-line not-italic text-[#555]">
              {[store.address, store.phone, store.email].filter(Boolean).join('\n')}
            </address>
          </div>
          <div className="text-right">
            <h1 className="text-xl font-semibold tracking-wide">INVOICE</h1>
            <dl className="mt-2 grid grid-cols-[auto_auto] justify-end gap-x-3 gap-y-0.5">
              <dt className="text-[#555]">Invoice no.</dt>
              <dd className="font-medium">{o.number}</dd>
              <dt className="text-[#555]">Order date</dt>
              <dd>{formatInstantDate(o.createdAt)}</dd>
              <dt className="text-[#555]">Issued</dt>
              <dd>{formatLongDay(invoice.issuedOn)}</dd>
            </dl>
          </div>
        </header>

        <section className="grid gap-6 border-b border-[#ddd] py-6 sm:grid-cols-2 print:grid-cols-2">
          <div>
            <h2 className="mb-1 text-xs font-semibold tracking-wide text-[#555] uppercase">
              Bill to / Deliver to
            </h2>
            <p className="font-medium">{o.customer.name}</p>
            <address className="not-italic">
              {a.line1}
              {a.line2 && <>, {a.line2}</>}
              <br />
              {[a.area, a.district, a.division].filter(Boolean).join(', ')}
              {a.postalCode && ` ${a.postalCode}`}
              <br />
              {o.customer.phone} · {o.customer.email}
            </address>
          </div>
          <div>
            <h2 className="mb-1 text-xs font-semibold tracking-wide text-[#555] uppercase">
              Payment
            </h2>
            <p>{payment}</p>
            {o.courierName && o.trackingNumber && (
              <p className="mt-2 text-[#555]">
                Courier: {o.courierName} · Tracking {o.trackingNumber}
              </p>
            )}
          </div>
        </section>

        <table className="mt-6 w-full">
          <thead>
            <tr className="border-b border-[#ddd] text-left text-xs tracking-wide text-[#555] uppercase">
              <th className="py-2 font-semibold">Item</th>
              <th className="py-2 text-right font-semibold">Qty</th>
              <th className="py-2 text-right font-semibold">Price</th>
              <th className="py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {o.items.map((i) => (
              <tr key={i.id} className="border-b border-[#eee] align-top">
                <td className="py-2">
                  {i.productName}
                  <span className="block text-xs text-[#555]">
                    {i.variantLabel} · {i.sku}
                  </span>
                </td>
                <td className="py-2 text-right tabular-nums">{i.quantity}</td>
                <td className="py-2 text-right tabular-nums">{formatBdt(i.unitPrice)}</td>
                <td className="py-2 text-right tabular-nums">{formatBdt(i.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="mt-4 ml-auto grid w-full max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-1">
          <dt>Subtotal</dt>
          <dd className="text-right tabular-nums">{formatBdt(t.subtotal)}</dd>
          {Number(t.discountAmount) > 0 && (
            <>
              <dt>Discount{t.discountCode && ` (${t.discountCode})`}</dt>
              <dd className="text-right tabular-nums">−{formatBdt(t.discountAmount)}</dd>
            </>
          )}
          <dt>Delivery ({a.zoneName})</dt>
          <dd className="text-right tabular-nums">{formatBdt(t.shippingFee)}</dd>
          {Number(t.vatAmount) > 0 && (
            <>
              <dt>VAT {Number(t.vatRate)}%</dt>
              <dd className="text-right tabular-nums">{formatBdt(t.vatAmount)}</dd>
            </>
          )}
          <dt className="border-t border-[#ddd] pt-2 font-semibold">Total</dt>
          <dd className="border-t border-[#ddd] pt-2 text-right font-semibold tabular-nums">
            {formatBdt(t.total)}
          </dd>
        </dl>

        <footer className="mt-10 border-t border-[#ddd] pt-4 text-center text-[#555]">
          Thank you for shopping with {store.name}
          {store.tagline && ` — ${store.tagline}`}.
        </footer>
      </article>
    </div>
  )
}
