import type { OrderReceiptView } from '@nowoll/types'
import Link from 'next/link'
import { formatBdt } from '@/lib/format'
import { OrderLines } from './order-lines'
import { paymentText } from './order-status'

/** Items, totals, delivery address and payment of a placed order. */
export function ReceiptDetails({ receipt }: { receipt: OrderReceiptView }) {
  const t = receipt.totals
  const a = receipt.deliveryAddress
  return (
    <div className="flex flex-col gap-6 text-left">
      <section aria-labelledby="receipt-items" className="flex flex-col gap-4">
        <h2 id="receipt-items" className="font-semibold">
          Your order
        </h2>
        <OrderLines items={receipt.items} />
        <dl className="flex flex-col gap-2 border-t border-border pt-4 text-sm">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd className="tabular-nums">{formatBdt(t.subtotal)}</dd>
          </div>
          {Number(t.discount) > 0 && (
            <div className="flex justify-between text-success">
              <dt>Discount{t.discountCode ? ` (${t.discountCode})` : ''}</dt>
              <dd className="tabular-nums">−{formatBdt(t.discount)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt>Delivery ({receipt.deliveryZone})</dt>
            <dd className="tabular-nums">
              {Number(t.shippingFee) === 0 ? 'Free' : formatBdt(t.shippingFee)}
            </dd>
          </div>
          {Number(t.vatRate) > 0 && (
            <div className="flex justify-between">
              <dt>VAT ({Number(t.vatRate)}%)</dt>
              <dd className="tabular-nums">{formatBdt(t.vatAmount)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatBdt(t.total)}</dd>
          </div>
        </dl>
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        <section aria-labelledby="receipt-delivery" className="text-sm">
          <h2 id="receipt-delivery" className="mb-1 font-semibold">
            Delivering to
          </h2>
          <p>{receipt.customerName}</p>
          <p className="text-muted-foreground">
            {[a.addressLine1, a.addressLine2, a.area, a.district, a.division, a.postalCode]
              .filter(Boolean)
              .join(', ')}
          </p>
        </section>
        <section aria-labelledby="receipt-payment" className="text-sm">
          <h2 id="receipt-payment" className="mb-1 font-semibold">
            Payment
          </h2>
          <p className="text-muted-foreground">
            {paymentText(receipt.paymentMethod, receipt.paymentStatus, receipt.total, formatBdt)}
          </p>
        </section>
      </div>

      <p className="text-sm text-muted-foreground">
        Keep your order number <strong>{receipt.displayNumber}</strong> — you can{' '}
        <Link
          href="/orders/track"
          className="font-medium text-foreground underline underline-offset-4"
        >
          track your order
        </Link>{' '}
        any time with it and your email or mobile number.
      </p>
    </div>
  )
}
